import { Mark, mergeAttributes } from "@tiptap/core";

const DATA_ATTRIBUTES = [
  ["id", "data-rd-id"],
  ["by", "data-rd-by"],
  ["at", "data-rd-at"],
  ["re", "data-rd-re"],
  ["pair", "data-rd-pair"],
  ["status", "data-rd-status"],
] as const;

type DataAttributeName = (typeof DATA_ATTRIBUTES)[number][0];

function dataAttributeSchema() {
  return Object.fromEntries(
    DATA_ATTRIBUTES.map(([name, attribute]) => [
      name,
      {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute(attribute),
        renderHTML: (attributes: Record<DataAttributeName, string | null>) =>
          attributes[name] ? { [attribute]: attributes[name] } : {},
      },
    ]),
  );
}

export const RdHighlight = Mark.create({
  name: "rdHighlight",
  priority: 1100,
  inclusive: false,
  spanning: true,

  addAttributes() {
    return dataAttributeSchema();
  },

  parseHTML() {
    return [{ tag: "mark[data-rd-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["mark", mergeAttributes(HTMLAttributes), 0];
  },
});

export const RdInsertion = Mark.create({
  name: "rdInsertion",
  priority: 1100,
  inclusive: false,
  spanning: true,

  addAttributes() {
    return dataAttributeSchema();
  },

  parseHTML() {
    return [{ tag: "ins[data-rd-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["ins", mergeAttributes(HTMLAttributes), 0];
  },
});

export const RdDeletion = Mark.create({
  name: "rdDeletion",
  priority: 1100,
  inclusive: false,
  spanning: true,

  addAttributes() {
    return dataAttributeSchema();
  },

  parseHTML() {
    return [{ tag: "del[data-rd-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["del", mergeAttributes(HTMLAttributes), 0];
  },
});

export const CommentAnchor = Mark.create({
  name: "commentRef",
  priority: 1100,
  inclusive: false,
  spanning: true,

  addAttributes() {
    return {
      commentIds: {
        default: [] as string[],
        parseHTML: (element: HTMLElement) => {
          const ids = element.getAttribute("data-comment-ids");
          if (!ids) return [];
          try {
            return JSON.parse(ids);
          } catch {
            return [];
          }
        },
        renderHTML: (attributes: { commentIds?: string[] }) =>
          attributes.commentIds?.length
            ? { "data-comment-ids": JSON.stringify(attributes.commentIds) }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-comment-ids]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "comment-anchor" }),
      0,
    ];
  },
});

export const reviewMarkExtensions = [RdHighlight, RdInsertion, RdDeletion];
