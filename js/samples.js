// A sample wardrobe for trying StyleCast without photographing anything.
//
// The pictures are simple drawings made on a canvas here in the browser, and the tags are
// set by hand, so no model download is needed. The set deliberately has gaps (nothing
// waterproof, nothing really warm) so the gap tips and the Shop tab have something to say.

export const SAMPLES = [
  { name: "white t-shirt", shape: "tee", colour: "white", fill: "#f4f4f2", category: "top", warmth: 1, waterproof: false, formality: "casual" },
  { name: "navy t-shirt", shape: "tee", colour: "navy", fill: "#1f2f57", category: "top", warmth: 1, waterproof: false, formality: "casual" },
  { name: "grey hoodie", shape: "hoodie", colour: "grey", fill: "#8a8d91", category: "top", warmth: 2, waterproof: false, formality: "casual" },
  { name: "light blue shirt", shape: "shirt", colour: "light blue", fill: "#a9c8ea", category: "top", warmth: 2, waterproof: false, formality: "smart" },
  { name: "blue jeans", shape: "trousers", colour: "denim", fill: "#3d5f8f", category: "bottom", warmth: 2, waterproof: false, formality: "casual" },
  { name: "black trousers", shape: "trousers", colour: "black", fill: "#24262a", category: "bottom", warmth: 2, waterproof: false, formality: "smart" },
  { name: "beige shorts", shape: "shorts", colour: "beige", fill: "#d8c7a3", category: "bottom", warmth: 1, waterproof: false, formality: "casual" },
  { name: "denim jacket", shape: "jacket", colour: "denim", fill: "#4a6f9c", category: "outerwear", warmth: 2, waterproof: false, formality: "casual" },
  { name: "white trainers", shape: "shoe", colour: "white", fill: "#f1f1ee", category: "shoes", warmth: 2, waterproof: false, formality: "casual" },
  { name: "black smart shoes", shape: "shoe", colour: "black", fill: "#1d1d1f", category: "shoes", warmth: 2, waterproof: false, formality: "smart" },
];

// Outlines on a 256 x 256 grid.
const SHAPES = {
  tee: [[78, 40], [108, 30], [128, 44], [148, 30], [178, 40], [222, 84], [194, 108], [178, 94], [178, 226], [78, 226], [78, 94], [62, 108], [34, 84]],
  shirt: [[78, 40], [108, 30], [128, 52], [148, 30], [178, 40], [210, 160], [184, 168], [178, 110], [178, 226], [78, 226], [78, 110], [72, 168], [46, 160]],
  hoodie: [[78, 46], [100, 22], [156, 22], [178, 46], [214, 170], [186, 178], [178, 116], [178, 226], [78, 226], [78, 116], [70, 178], [42, 170]],
  jacket: [[74, 40], [108, 28], [128, 40], [148, 28], [182, 40], [218, 176], [188, 184], [182, 120], [182, 232], [74, 232], [74, 120], [68, 184], [38, 176]],
  trousers: [[82, 28], [174, 28], [184, 228], [140, 228], [128, 96], [116, 228], [72, 228]],
  shorts: [[78, 60], [178, 60], [190, 170], [140, 176], [128, 120], [116, 176], [66, 170]],
  shoe: [[40, 150], [96, 150], [120, 120], [150, 118], [176, 146], [216, 160], [222, 190], [40, 190]],
};

function draw(s) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#e9e5de";
  g.fillRect(0, 0, 256, 256);
  g.beginPath();
  SHAPES[s.shape].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fillStyle = s.fill;
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.stroke();
  // A few details so the items are easier to tell apart.
  g.strokeStyle = "rgba(0,0,0,0.3)";
  g.beginPath();
  if (s.shape === "shirt") { for (let y = 70; y < 220; y += 30) g.rect(126, y, 4, 4); }
  if (s.shape === "jacket") { g.moveTo(128, 40); g.lineTo(128, 232); }
  if (s.shape === "hoodie") { g.moveTo(110, 30); g.quadraticCurveTo(128, 70, 146, 30); }
  if (s.shape === "shoe") { g.moveTo(40, 178); g.lineTo(222, 178); }
  g.stroke();
  return new Promise((resolve) => c.toBlob(resolve, "image/jpeg", 0.85));
}

// Ready-to-store items, with the same fields a tagged photo gets.
export async function sampleItems(newId) {
  const now = Date.now();
  return Promise.all(SAMPLES.map(async ({ shape, fill, ...tags }, n) => ({
    id: newId(), added: now - n, photo: await draw({ shape, fill }), inWash: false, lastWorn: null, sample: true, ...tags,
  })));
}
