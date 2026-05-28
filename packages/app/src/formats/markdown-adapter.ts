import {
  markdownAdapter as baseMarkdownAdapter,
  type EditorState,
  type FormatAdapter,
  type ParseOptions,
} from "@roughdraft/formats";
import {
  criticMarkdownToEditorState,
  editorStateToCriticMarkdown,
} from "../critic-markup";

export const markdownAdapter: FormatAdapter = {
  ...baseMarkdownAdapter,

  parse(rawContent: string, options?: ParseOptions): EditorState {
    const { doc, comments, frontmatter } = criticMarkdownToEditorState(
      rawContent,
      options,
    );
    return { doc, comments, frontmatter };
  },

  serialize(state: EditorState): string {
    return editorStateToCriticMarkdown(state.doc, state.comments, {
      frontmatter: state.frontmatter,
    });
  },
};
