import assert from "node:assert/strict";
import { test } from "node:test";
import { toCsv } from "./csv.ts";

const body = (csv: string) => csv.replace(/^﻿/, "").trimEnd().split("\r\n");

test("starts with a byte-order mark so Excel reads it as UTF-8", () => {
  assert.equal(toCsv(["a"], []).charCodeAt(0), 0xfeff);
});

test("quotes cells containing commas, quotes or line breaks", () => {
  const [, row] = body(toCsv(["a", "b", "c"], [["x,y", 'say "hi"', "two\nlines"]]));
  assert.equal(row, '"x,y","say ""hi""","two\nlines"');
});

test("writes empty cells for null and undefined, and keeps numbers and booleans", () => {
  const [, row] = body(toCsv(["a", "b", "c", "d"], [[null, undefined, -5, false]]));
  assert.equal(row, ",,-5,false");
});

test("keeps Chinese text as is", () => {
  const [, row] = body(toCsv(["label"], [["A lot / 非常享受"]]));
  assert.equal(row, "A lot / 非常享受");
});

test("neutralises text that a spreadsheet would run as a formula", () => {
  const [, row] = body(toCsv(["note"], [["=SUM(A1:A9)"]]));
  assert.equal(row, "'=SUM(A1:A9)");
});
