import { test } from "node:test";
import assert from "node:assert/strict";
import { TYPES, COLOURS, prompts, labelVectors, rank, tagsFor, padToSquare } from "../js/labels.js";

test("every type has descriptions and every label gets sentences", () => {
  const p = prompts();
  assert.equal(p.types.length, Object.keys(TYPES).length);
  assert.equal(p.colours.length, COLOURS.length);
  for (const g of [...p.types, ...p.colours]) assert.ok(g.texts.length >= 2, g.label);
});

test("label vectors average their sentences and rank by similarity", () => {
  const groups = [{ label: "jeans", texts: ["a", "b"] }, { label: "denim jacket", texts: ["c"] }];
  const vecs = labelVectors(groups, [[1, 0], [1, 0.2], [0, 1]]);
  assert.deepEqual(rank([1, 0.05], vecs).map((r) => r.label), ["jeans", "denim jacket"]);
  assert.deepEqual(rank([0.1, 1], vecs).map((r) => r.label), ["denim jacket", "jeans"]);
});

test("tags come from the type, without the descriptions", () => {
  assert.deepEqual(tagsFor("jeans", "blue"), {
    name: "blue jeans", colour: "blue", category: "bottom", warmth: 2, waterproof: false, formality: "casual",
  });
});

test("a tall photo is padded to a white square, not cropped", () => {
  const data = new Uint8ClampedArray([10, 10, 10, 20, 20, 20]); // 1 wide, 2 tall, RGB
  const sq = padToSquare(data, 1, 2, 3);
  assert.equal(sq.width, 2);
  assert.equal(sq.height, 2);
  assert.deepEqual([...sq.data], [10, 10, 10, 255, 255, 255, 20, 20, 20, 255, 255, 255]);
  const one = new Uint8ClampedArray([1, 2, 3]);
  assert.equal(padToSquare(one, 1, 1, 3).data, one);
});
