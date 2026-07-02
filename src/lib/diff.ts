// Lightweight word-level diff (LCS) for showing what changed between two
// versions of a post. Whitespace is preserved as its own tokens so the
// reconstructed text reads naturally.

export type DiffPart = { type: "same" | "add" | "del"; value: string };

function tokenize(s: string): string[] {
  return s.split(/(\s+)/).filter((t) => t.length > 0);
}

export function diffWords(oldStr: string, newStr: string): DiffPart[] {
  const a = tokenize(oldStr);
  const b = tokenize(newStr);
  const m = a.length;
  const n = b.length;

  // LCS length table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffPart[] = [];
  const push = (type: DiffPart["type"], value: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.value += value;
    else out.push({ type, value });
  };

  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push("del", a[i]);
      i++;
    } else {
      push("add", b[j]);
      j++;
    }
  }
  while (i < m) push("del", a[i++]);
  while (j < n) push("add", b[j++]);

  return out;
}

export function diffImages(prev: string[], cur: string[]) {
  const prevSet = new Set(prev);
  const curSet = new Set(cur);
  return {
    kept: cur.filter((u) => prevSet.has(u)),
    added: cur.filter((u) => !prevSet.has(u)),
    removed: prev.filter((u) => !curSet.has(u)),
  };
}
