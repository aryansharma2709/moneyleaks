// app/api/analyze/route.ts
import {
    categorizeTransaction,
    computeSummary,
    mapRowToTransaction,
    parseCsv,
    parsePdfTextToRows,
} from "@/lib/transactions";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    let rows: Record<string, string>[] = [];

    const fileName = (file.name || "").toLowerCase();
    const fileType = (file.type || "").toLowerCase();

    // --------- PDF BRANCH ---------
    if (fileName.endsWith(".pdf") || fileType === "application/pdf") {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const pdfModule = await import("pdf-parse");
        const pdfParse = (pdfModule as any).default || (pdfModule as any);

        const data = await pdfParse(buffer);
        const text: string = data.text || "";

        rows = parsePdfTextToRows(text);
      } catch (pdfError) {
        console.error("PDF parsing failed:", pdfError);
        return NextResponse.json(
          {
            error:
              "Could not read text from this PDF. Some bank PDFs are scanned images. Try downloading your statement as CSV or as a text-based PDF and upload again.",
          },
          { status: 400 }
        );
      }
    } else {
      // --------- CSV BRANCH ---------
      const text = await file.text();
      rows = parseCsv(text);
    }

    if (!rows.length) {
      return NextResponse.json(
        {
          error:
            "Could not detect any transactions in this file. Check that your CSV/PDF layout matches your bank’s standard e-statement.",
        },
        { status: 400 }
      );
    }

    const transactions = rows
      .map(mapRowToTransaction)
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map(categorizeTransaction);

    const summary = computeSummary(transactions);

    return NextResponse.json({
      transactions,
      summary,
    });
  } catch (err) {
    console.error("Error in /api/analyze:", err);
    return NextResponse.json(
      {
        error:
          "Failed to analyze file. Make sure it's a valid CSV or a text-based PDF exported from your bank.",
      },
      { status: 500 }
    );
  }
}
