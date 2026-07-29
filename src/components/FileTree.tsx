import { useMemo } from "preact/hooks";
import { useSignal } from "@preact/signals";
import type { TorrentFileEntry } from "../hooks/useTorrents";
import { fmtBytes } from "../utils/format";

type Priority = "high" | "normal" | "low" | "skip";

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  included: boolean;
  priority: Priority;
  children: TreeNode[];
  fileIndex?: number;
}

// Playable media extensions for detecting video/audio files
const PLAYABLE_EXTENSIONS = new Set([
  "mp4", "mkv", "webm", "avi", "mov", "wmv", "flv", "m4v", "3gp", "mpg", "mpeg", "ts",
  "mp3", "flac", "ogg", "oga", "wav", "aac", "m4a", "wma", "opus",
]);

function isPlayableName(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return PLAYABLE_EXTENSIONS.has(ext);
}

interface Props {
  files: TorrentFileEntry[];
  onSelectionChange: (includedIndices: number[]) => void;
  loading: boolean;
  onPlayFile?: (fileIndex: number, fileName: string) => void;
}

function buildTree(files: TorrentFileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const parts = f.components;
    let level = root;

    for (let p = 0; p < parts.length; p++) {
      const isLast = p === parts.length - 1;
      const partName = parts[p];
      const existing = level.find((n) => n.name === partName);

      if (existing && !isLast) {
        level = existing.children;
      } else if (existing && isLast) {
        existing.isDir = false;
        existing.size = f.length;
        existing.included = f.included;
        existing.fileIndex = i;
      } else {
        const node: TreeNode = {
          name: partName,
          path: parts.slice(0, p + 1).join("/"),
          isDir: !isLast,
          size: isLast ? f.length : 0,
          included: isLast ? f.included : true,
          priority: "normal",
          children: [],
          fileIndex: isLast ? i : undefined,
        };
        level.push(node);
        if (!isLast) level = node.children;
      }
    }
  }

  return root;
}

function setNodeIncluded(node: TreeNode, included: boolean): void {
  if (node.isDir) {
    for (const c of node.children) setNodeIncluded(c, included);
  } else {
    node.included = included;
  }
}

function calcDirIncluded(node: TreeNode): boolean {
  if (!node.isDir) return node.included;
  if (node.children.length === 0) return true;
  return node.children.every((c) => calcDirIncluded(c));
}

export function FileTree({ files, onSelectionChange, loading, onPlayFile }: Props) {
  // Version counter forces re-render when checkboxes are toggled
  const version = useSignal(0);
  const tree = useMemo(() => buildTree(files), [files]);

  if (loading) {
    return <div class="file-tree-loading">Loading file list\u2026</div>;
  }

  if (tree.length === 0) {
    return <div class="file-tree-loading">No file information available.</div>;
  }

  const handleToggle = (node: TreeNode) => {
    setNodeIncluded(node, !node.included);

    // Collect all leaf indices that are now included
    const included: number[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f) continue;
      let level = tree;
      let isIncluded = true;
      for (const part of f.components) {
        const child = level.find((n) => n.name === part);
        if (!child) { isIncluded = false; break; }
        if (!child.isDir && !child.included) { isIncluded = false; break; }
        if (child.isDir) level = child.children;
      }
      if (isIncluded) included.push(i);
    }

    version.value += 1; // force re-render so checkboxes update
    onSelectionChange(included);
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const included = node.isDir ? calcDirIncluded(node) : node.included;
    const indent = depth * 16;
    const isPlayable = !node.isDir && isPlayableName(node.name) && onPlayFile;

    return (
      <div key={node.path || node.name}>
        <div
          class="file-tree-row"
          style={`padding-left: ${indent + 8}px`}
          onClick={() => handleToggle(node)}
        >
          <span class="file-tree-check">
            {included ? "\u2611" : "\u2610"}
          </span>
          <span class="file-tree-icon">
            {node.isDir ? "\u{1F4C1}" : "\u{1F4C4}"}
          </span>
          <span class="file-tree-name">{node.name}</span>
          {node.size > 0 && (
            <span class="file-tree-size">{fmtBytes(node.size)}</span>
          )}
          {isPlayable && node.fileIndex !== undefined && (
            <button
              class="file-play-btn"
              title="Play"
              onClick={(e) => {
                e.stopPropagation();
                onPlayFile!(node.fileIndex!, node.name);
              }}
            >
              ▶
            </button>
          )}
        </div>
        {node.isDir &&
          node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  // Use version signal value to force re-render
  void version.value;

  return (
    <div class="file-tree">
      {tree.map((node) => renderNode(node, 0))}
    </div>
  );
}
