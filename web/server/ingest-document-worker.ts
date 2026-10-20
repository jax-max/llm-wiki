import { parentPort, workerData } from "node:worker_threads";
import { createRequire } from "node:module";
import path from "node:path";
import {
  OfficeParser,
  type OfficeError,
  type OfficeContentNode,
} from "officeparser";
import type { DocumentRequest, DocumentResult } from "./ingest-document.js";

const { format, bytes, limits } = workerData as DocumentRequest;

async function extractPdf(): Promise<DocumentResult> {
  if (!Buffer.from(bytes.subarray(0, 1024)).includes("%PDF-"))
    return { code: "upload_corrupt", message: "PDF 文件头无效，请检查格式" };
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const require = createRequire(import.meta.url);
  const pdfRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
  const task = getDocument({
    data: new Uint8Array(bytes),
    cMapUrl: path.join(pdfRoot, "cmaps") + path.sep,
    cMapPacked: true,
    standardFontDataUrl: path.join(pdfRoot, "standard_fonts") + path.sep,
    wasmUrl: path.join(pdfRoot, "wasm") + path.sep,
    useWorkerFetch: false,
    stopAtErrors: true,
    verbosity: 0,
    maxImageSize: 1,
  });
  try {
    const document = await task.promise;
    const sections: string[] = [];
    let length = 0;
    let hasText = false;
    for (let n = 1; n <= document.numPages; n++) {
      const page = await document.getPage(n);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) =>
          "str" in item ? item.str + (item.hasEOL ? "\n" : "") : "",
        )
        .join("")
        .trim();
      hasText ||= !!text;
      const section = `## Page ${n}\n\n${text}`;
      length += section.length + 2;
      if (length > limits.maxTextChars)
        return {
          code: "upload_limit",
          message: "提取文本超过长度限制，请拆分后重试",
        };
      sections.push(section);
      page.cleanup();
    }
    return hasText
      ? { text: sections.join("\n\n").replace(/\0/g, "") }
      : {
          code: "upload_empty",
          message: "未提取到正文；扫描件或图片请先进行 OCR 后重新上传",
        };
  } finally {
    await task.destroy();
  }
}

async function extract(): Promise<DocumentResult> {
  try {
    if (format === "pdf") return await extractPdf();
    // Detect from bytes, then check the result against the filename. Supplying
    // fileType would make the extension authoritative and weaken this check.
    const ast = await OfficeParser.parseOffice(Buffer.from(bytes), {
      ocr: false,
      extractAttachments: false,
      includeRawContent: false,
      ignoreComments: true,
      decompressionLimits: {
        maxUncompressedBytes: limits.maxUncompressedBytes,
      },
      // A mislabeled PDF may be detected here: keep that work in this worker.
      pdfParserConfig: { separateProcess: false, extractTextColor: false },
    });
    if (ast.type !== format)
      return { code: "upload_format", message: "文件内容与扩展名不匹配" };
    const incomplete = (type: string) =>
      /LIMIT_EXCEEDED|PART_NOT_READ|ALT_CHUNK_NOT_READ|PAGE_LOAD_FAILED|TEXT_ENCODING_SUSPECT/.test(
        type,
      );
    if (ast.warnings.some((issue) => incomplete(issue.code)))
      return {
        code: "upload_limit",
        message: "文档内容未能完整提取，请拆分或转换格式后重试",
      };

    // Check actual content before the generator adds page/slide headings.
    let contentChars = 0;
    const inspect = (nodes: OfficeContentNode[]): void => {
      for (const node of nodes) {
        if (node.type === "image" || node.type === "drawing") continue;
        if (node.children?.length) inspect(node.children);
        else contentChars += node.text?.trim().length || 0;
      }
    };
    inspect(ast.content);
    if (!contentChars)
      return {
        code: "upload_empty",
        message: "未提取到正文；扫描件或图片请先进行 OCR 后重新上传",
      };
    if (contentChars > limits.maxTextChars)
      return {
        code: "upload_limit",
        message: "提取文本超过长度限制，请拆分后重试",
      };

    // Add stable, source-relative page identifiers while leaving all Markdown
    // rendering (including tables and lists) to officeparser.
    for (const node of ast.content) {
      if (node.type === "page" || node.type === "slide") {
        const label =
          node.type === "page"
            ? `Page ${node.metadata?.pageNumber}`
            : `Slide ${node.metadata?.slideNumber}`;
        node.children = [
          {
            type: "heading",
            text: label,
            metadata: { level: 2 },
            children: [{ type: "text", text: label }],
          },
          ...(node.children || []),
        ];
      }
    }
    const generated = await ast.to("md", {
      includeImages: false,
      generateIds: false,
      mdConfig: { dialect: "github", fallbackToHtml: false },
      onNode: (node) => {
        if (node.type === "embed" || node.type === "drawing") return false;
      },
    });
    if (generated.messages.some((issue) => incomplete(issue.code)))
      return {
        code: "upload_limit",
        message: "文档内容未能完整提取，请拆分或转换格式后重试",
      };
    const text = generated.value
      .replace(/\r\n?/g, "\n")
      .replace(/\0/g, "")
      .trim();
    if (text.length > limits.maxTextChars)
      return {
        code: "upload_limit",
        message: "提取文本超过长度限制，请拆分后重试",
      };
    return { text };
  } catch (error) {
    const type = (error as OfficeError).officeIssue?.code || "";
    if (
      /PASSWORD|DECRYPTION/.test(type) ||
      (error as Error).name === "PasswordException"
    )
      return {
        code: "upload_encrypted",
        message: "暂不支持加密文档，请移除密码后重新上传",
      };
    if (/LIMIT_EXCEEDED|OUTPUT_TOO_LARGE/.test(type))
      return {
        code: "upload_limit",
        message: "文档解析超过资源限制，请拆分后重试",
      };
    return {
      code: "upload_corrupt",
      message: "无法解析文档，请检查文件是否损坏或格式是否正确",
    };
  }
}

parentPort!.postMessage(await extract());
