import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToStream,
} from "@react-pdf/renderer";

import { getPatientBrand } from "@/lib/branding";
import { BrandIconPdf } from "@/lib/branding-pdf";
import { centsToCheckWords } from "@/lib/number-to-words";
import type { Patient } from "@/lib/db/schema";

export type CheckPdfData = {
  patient: Patient;
  payeeName: string;
  amountCents: number;
  date: Date;
  memo: string | null;
  code: string;
  locale: string;
  currency: string;
};

// US Letter is 8.5 x 11 inches — @react-pdf uses PostScript points (72/inch),
// so 612 x 792. The check spans the full top ~3.5 inches; the rest is
// whitespace with a cut line near the top-of-bottom-half so caregivers can
// trim along it.
const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;
const CHECK_HEIGHT = 252; // 3.5 inches

const styles = StyleSheet.create({
  page: {
    width: LETTER_WIDTH,
    height: LETTER_HEIGHT,
    paddingTop: 24,
    paddingHorizontal: 24,
    fontFamily: "Times-Roman",
    fontSize: 11,
    color: "#0f172a",
    backgroundColor: "white",
  },
  check: {
    height: CHECK_HEIGHT,
    borderWidth: 1,
    borderColor: "#475569",
    borderStyle: "solid",
    padding: 18,
    flexDirection: "column",
    justifyContent: "space-between",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  brandBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  brand: {
    fontSize: 22,
    fontFamily: "Times-Bold",
    letterSpacing: 1.2,
  },
  brandAddress: {
    marginTop: 4,
    fontSize: 9,
    color: "#475569",
  },
  checkNumberDate: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  date: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  dateLabel: {
    fontSize: 9,
    color: "#475569",
    marginRight: 4,
  },
  dateValue: {
    fontSize: 11,
    borderBottomWidth: 0.5,
    borderBottomColor: "#475569",
    minWidth: 140,
    paddingBottom: 1,
    textAlign: "center",
  },
  payRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginTop: 14,
  },
  payToLabel: {
    fontFamily: "Times-Bold",
    fontSize: 10,
    width: 110,
    paddingBottom: 2,
  },
  payeeLine: {
    flex: 1,
    fontSize: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: "#475569",
    paddingHorizontal: 8,
    paddingBottom: 2,
  },
  amountBox: {
    marginLeft: 8,
    minWidth: 130,
    borderWidth: 0.75,
    borderColor: "#475569",
    paddingVertical: 4,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "flex-start",
  },
  amountSign: {
    fontFamily: "Times-Bold",
    marginRight: 6,
  },
  amountValue: {
    fontFamily: "Times-Bold",
    fontSize: 14,
  },
  wordsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginTop: 12,
  },
  wordsLine: {
    flex: 1,
    fontSize: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#475569",
    paddingHorizontal: 6,
    paddingBottom: 2,
  },
  dollarsLabel: {
    marginLeft: 8,
    fontFamily: "Times-Bold",
    fontSize: 10,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 16,
  },
  memoBlock: {
    flexDirection: "column",
    width: 240,
  },
  memoLabel: {
    fontSize: 9,
    color: "#475569",
  },
  memoLine: {
    marginTop: 2,
    fontSize: 11,
    borderBottomWidth: 0.5,
    borderBottomColor: "#475569",
    paddingBottom: 2,
    minHeight: 14,
  },
  signatureBlock: {
    flexDirection: "column",
    width: 220,
    alignItems: "flex-end",
  },
  signatureLine: {
    width: "100%",
    borderBottomWidth: 0.5,
    borderBottomColor: "#475569",
    minHeight: 18,
  },
  signatureLabel: {
    marginTop: 2,
    fontSize: 9,
    color: "#475569",
  },
  micr: {
    marginTop: 14,
    fontSize: 13,
    fontFamily: "Courier",
    letterSpacing: 2,
    textAlign: "center",
    color: "#0f172a",
  },
  codeRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  codeText: {
    fontSize: 9,
    color: "#475569",
    fontFamily: "Courier",
  },
  cutLine: {
    marginTop: 18,
    borderTopWidth: 0.5,
    borderTopColor: "#94a3b8",
    borderStyle: "dashed",
    paddingTop: 4,
    textAlign: "center",
    fontSize: 8,
    color: "#94a3b8",
    letterSpacing: 1,
  },
});

// Fake bank address tuned to the patient's currency. The currency is the
// single most reliable indicator of which country a patient identifies with —
// locale alone (e.g. "en-US" vs "en-CA") is often left at the system
// default. EUR falls back to a generic Eurozone street with no country
// suffix because eleven different countries share it.
const FAKE_ADDRESS_BY_CURRENCY: Record<string, string> = {
  USD: "1 Main Street · Anywhere, USA",
  CAD: "1 Main Street · Anywhere, Canada",
  GBP: "1 High Street · Anywhere, United Kingdom",
  AUD: "1 Main Road · Anywhere, Australia",
  NZD: "1 Main Street · Anywhere, New Zealand",
  EUR: "1 Rue Principale · Anywhere",
  CHF: "1 Hauptstrasse · Anywhere, Switzerland",
  JPY: "1 Main Street · Anywhere, Japan",
};

function fakeAddressForCurrency(currency: string): string {
  return (
    FAKE_ADDRESS_BY_CURRENCY[currency.toUpperCase()] ??
    "1 Main Street · Anywhere"
  );
}

function formatLongDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatMoney(cents: number, locale: string, currency: string): string {
  // narrowSymbol: a printed check shows "$1,234.56", never "US$1,234.56" —
  // matches the on-screen treatment (M9 round 2).
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(cents / 100);
}

// The check as a standalone @react-pdf Page. Extracted so both the
// single-check document and the workbook PDF (whose final page IS the reward
// check, per ADR 0004) draw from one layout rather than duplicating it.
export function CheckPage(data: CheckPdfData) {
  const brand = getPatientBrand(data.patient);
  const amountWords = centsToCheckWords(data.amountCents);
  const numericAmount = formatMoney(
    data.amountCents,
    data.locale,
    data.currency,
  );

  return (
    <Page size="LETTER" style={styles.page}>
      <View style={styles.check}>
          <View style={styles.topRow}>
            <View>
              <View style={styles.brandBlock}>
                <BrandIconPdf size={64} />
                <Text style={styles.brand}>{brand.name}</Text>
              </View>
              <Text style={styles.brandAddress}>
                {fakeAddressForCurrency(data.currency)}
              </Text>
            </View>
            <View style={styles.checkNumberDate}>
              <View style={styles.date}>
                <Text style={styles.dateLabel}>Date</Text>
                <Text style={styles.dateValue}>
                  {formatLongDate(data.date, data.locale)}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.payRow}>
            <Text style={styles.payToLabel}>Pay to the order of</Text>
            <Text style={styles.payeeLine}>{data.payeeName}</Text>
            <View style={styles.amountBox}>
              <Text style={styles.amountSign}>$</Text>
              <Text style={styles.amountValue}>
                {numericAmount.replace(/^[^\d-]+/, "")}
              </Text>
            </View>
          </View>

          <View style={styles.wordsRow}>
            <Text style={styles.wordsLine}>{amountWords}</Text>
            <Text style={styles.dollarsLabel}>DOLLARS</Text>
          </View>

          <View style={styles.bottomRow}>
            <View style={styles.memoBlock}>
              <Text style={styles.memoLabel}>Memo</Text>
              <Text style={styles.memoLine}>{data.memo ?? ""}</Text>
            </View>
            <View style={styles.signatureBlock}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>Authorized signature</Text>
            </View>
          </View>

          <Text style={styles.micr}>
            {"⑆ 000000000 ⑆  0000000000 ⑈  0000"}
          </Text>

          <View style={styles.codeRow}>
            <Text style={styles.codeText}>Deposit code: {data.code}</Text>
            <Text style={styles.codeText}>Not negotiable</Text>
          </View>
        </View>

        <Text style={styles.cutLine}>--- cut here ---</Text>
    </Page>
  );
}

export function CheckDocument(data: CheckPdfData) {
  const brand = getPatientBrand(data.patient);
  return (
    <Document title={`${brand.name} Check ${data.code}`} author={brand.name}>
      <CheckPage {...data} />
    </Document>
  );
}

export async function renderCheckPdfStream(
  data: CheckPdfData,
): Promise<NodeJS.ReadableStream> {
  return renderToStream(<CheckDocument {...data} />);
}
