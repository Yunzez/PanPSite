/**
 * The post-session experience questions (requirements §8). These are fixed,
 * app-level content, the same for every material and both modes.
 *
 * Wording and option order must match the research protocol exactly. If any
 * text changes, bump that item's `version`: it is stored with every answer.
 */
export type FeedbackOption = {
  id: string;
  en: string;
  zh: string;
};

export type FeedbackItem = {
  id: string;
  version: string;
  en: string;
  zh: string;
  /** Always four options, shown in this fixed order. */
  options: FeedbackOption[];
};

/** Asked after every session, with face buttons. */
export const sessionFeedbackItems: FeedbackItem[] = [
  {
    id: "enjoyment",
    version: "1",
    en: "Did you enjoy reading today?",
    zh: "你享受今天的阅读过程吗？",
    options: [
      { id: "1", en: "Not at all", zh: "一点也不" },
      { id: "2", en: "A little", zh: "有一点" },
      { id: "3", en: "Quite a bit", zh: "比较享受" },
      { id: "4", en: "A lot", zh: "非常享受" },
    ],
  },
  {
    id: "difficulty",
    version: "1",
    en: "How hard was today's story to read?",
    zh: "今天的故事读起来有多难？",
    options: [
      { id: "1", en: "Very hard", zh: "很难" },
      { id: "2", en: "A little hard", zh: "有点难" },
      { id: "3", en: "Fairly easy", zh: "比较容易" },
      { id: "4", en: "Very easy", zh: "很容易" },
    ],
  },
  {
    id: "attention",
    version: "1",
    en: "How focused were you while reading?",
    zh: "今天朗读时，你有多专心？",
    options: [
      { id: "1", en: "Not focused at all", zh: "一点也不专心" },
      { id: "2", en: "A little focused", zh: "有点专心" },
      { id: "3", en: "Quite focused", zh: "比较专心" },
      { id: "4", en: "Very focused", zh: "非常专心" },
    ],
  },
];

/** Asked only when the researcher enables it, with text buttons. */
export const finalFeedbackItems: FeedbackItem[] = [
  {
    id: "finding-lines",
    version: "1",
    en: "Was it easy to find your lines?",
    zh: "找到自己的台词容易吗？",
    options: [
      { id: "1", en: "Very hard", zh: "很难" },
      { id: "2", en: "A little hard", zh: "有点难" },
      { id: "3", en: "Fairly easy", zh: "比较容易" },
      { id: "4", en: "Very easy", zh: "很容易" },
    ],
  },
  {
    id: "filter-distraction",
    version: "1",
    en: "Did the animal filter take your attention away from the words?",
    zh: "动物滤镜会让你读台词时分心吗？",
    options: [
      { id: "1", en: "Never", zh: "从不" },
      { id: "2", en: "Sometimes", zh: "有时" },
      { id: "3", en: "Often", zh: "经常" },
      { id: "4", en: "Always", zh: "总是" },
    ],
  },
];
