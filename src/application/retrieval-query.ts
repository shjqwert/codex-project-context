import { tokenizeBm25 } from "./bm25.js";

export interface RetrievalQuery {
  positive: string;
  clauses: string[];
  excluded: string[];
  explicitAll: boolean;
  continuationOnly: boolean;
}

/** Interpret only explicit exclusions; failure descriptions are not exclusions. */
export function analyzeRetrievalQuery(prompt: string): RetrievalQuery {
  const text = prompt.normalize("NFKC").replaceAll("\\", "/");
  const parts = text.split(/(?:[，,；;。\n]|\s+but\s+|\s+and\s+(?=(?:inspect|read|show|continue|handle|process|find|skip|exclude|ignore|do not|don't)\b)|而是|改为)/iu)
    .map((part) => part.trim().replace(/^(?:(?:请|麻烦你?|劳驾|帮我|帮忙)\s*|please\s+)+/iu, "")).filter(Boolean);
  const hasContrast = /\s+but\s+|而是|改为|[，,]\s*现在/iu.test(text);
  const excluded: string[] = [];
  const positiveParts: string[] = [];
  for (const part of parts) {
    const exclusion = part.match(/^(?:不要|别|排除|跳过|不再)(?:再|继续|处理|查看|检索|读取|讨论|查询|考虑|使用)?\s*(.+)$/u)
      ?? part.match(/^(?:do not|don't|exclude|skip|ignore)\s+(?:(?:continue|read|use|search|discuss|work on)\s+)?(.+)$/iu)
      ?? (hasContrast ? part.match(/^(?:不是|not\s+)\s*(.+)$/iu) : null);
    if (exclusion?.[1]) excluded.push(exclusion[1].trim());
    else positiveParts.push(part);
  }
  const positive = positiveParts.join(" ");
  const split = positiveParts.flatMap((part) => part.split(/\s+(?:and|also|plus)\s+|以及|并且|同时|还有|和|与/iu))
    .map((part) => part.trim()).filter(Boolean);
  const topics = split.filter((part) => tokenizeBm25(part).length > 0 || /\b[A-Z]{2,}\b/u.test(part));
  const clauses = topics.length > 1 ? topics : positive ? [positive] : [];
  const continuationCue = /上次|上一个窗口|上一窗口|接着上次|继续之前|之前的(?:工作|任务)|刚才的(?:工作|任务)|continue\s+(?:the\s+)?(?:previous|last)|pick\s+up\s+where/iu;
  const remainder = positive
    .replace(/(?:继续|接着)?(?:上次|上一个窗口|上一窗口|之前|刚才)(?:的)?(?:工作|任务)?/gu, " ")
    .replace(/(?:continue\s+(?:the\s+)?(?:previous|last)(?:\s+(?:work|task))?|pick\s+up\s+where\s+we\s+left\s+off)/giu, " ");
  const explicitAll = /\b(?:all|both)\b|所有|全部|分别/iu.test(positive);
  const onlyPoliteness = remainder.replace(/\b(?:please|thanks|thank you)\b/giu, "")
    .replace(/^(?:请|麻烦)|(?:吧|呀|啊|谢谢)$/gu, "").replace(/[\s\p{P}]/gu, "").length === 0;
  return {
    positive, clauses, excluded,
    explicitAll,
    continuationOnly: excluded.length === 0 && continuationCue.test(positive) && onlyPoliteness,
  };
}
