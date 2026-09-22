import { env } from "../config/env";
import { PDF_PAGE_MARGINS } from "../config/pdf-page";

export interface HtmlToPdfInput {
  html: string;
  footerHtml?: string;
  landscape?: boolean;
}

/**
 * Converts HTML to PDF via Gotenberg (Chromium route). The main file MUST be
 * named index.html. The Content-Type header is intentionally NOT set manually
 * — fetch fills in the multipart boundary.
 */
export async function htmlToPdf(input: HtmlToPdfInput): Promise<Uint8Array> {
  const form = new FormData();
  form.append(
    "files",
    new Blob([input.html], { type: "text/html" }),
    "index.html",
  );
  if (input.footerHtml) {
    form.append(
      "files",
      new Blob([input.footerHtml], { type: "text/html" }),
      "footer.html",
    );
  }

  form.append("paperWidth", "8.27");
  form.append("paperHeight", "11.69");
  form.append("marginTop", String(PDF_PAGE_MARGINS.top));
  form.append("marginBottom", String(PDF_PAGE_MARGINS.bottom));
  form.append("marginLeft", String(PDF_PAGE_MARGINS.left));
  form.append("marginRight", String(PDF_PAGE_MARGINS.right));
  form.append("printBackground", "true");
  if (input.landscape) {
    form.append("landscape", "true");
  }

  const response = await fetch(
    `${env.GOTENBERG_URL}/forms/chromium/convert/html`,
    {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(env.GOTENBERG_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(
      `Gotenberg responded ${response.status}: ${bodyText.slice(0, 300)}`,
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}
