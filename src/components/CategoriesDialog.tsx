import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import {
  getCategories, addCategory, removeCategory, updateCategory,
  getTags, addTag, removeTag,
  getGlobalDownloadPath, setGlobalDownloadPath,
  type CategoryPayload, type TagPayload,
} from "../hooks/useTorrents";

interface Props {
  onClose: () => void;
}

export function CategoriesDialog({ onClose }: Props) {
  const categories = useSignal<CategoryPayload[]>([]);
  const tags = useSignal<TagPayload[]>([]);
  const globalPath = useSignal<string | null>(null);

  const tab = useSignal<"categories" | "tags" | "paths">("categories");

  // New category form
  const newCatName = useSignal("");
  const newCatIcon = useSignal("\u{1F4C1}");
  const newCatPath = useSignal("");
  const newCatRule = useSignal("");

  // New tag form
  const newTagName = useSignal("");
  const newTagColor = useSignal("#34d35e");
  const newTagRule = useSignal("");

  // Edit state
  const editingCat = useSignal<number | null>(null);
  const editCatName = useSignal("");
  const editCatIcon = useSignal("");
  const editCatPath = useSignal("");
  const editCatRule = useSignal("");

  // Tag editing signals (reserved for future use)
  // const editingTag = useSignal<number | null>(null);

  const loading = useSignal(true);

  const refresh = async () => {
    try {
      const [cats, ts, path] = await Promise.all([
        getCategories(), getTags(), getGlobalDownloadPath(),
      ]);
      categories.value = cats;
      tags.value = ts;
      globalPath.value = path;
    } catch (e) {
      console.error("Failed to load config:", e);
    }
    loading.value = false;
  };

  useEffect(() => { refresh(); }, []);

  const handleAddCategory = async () => {
    if (!newCatName.value.trim()) return;
    try {
      const cat = await addCategory(
        newCatName.value.trim(), newCatIcon.value,
        newCatPath.value.trim() || null,
        newCatRule.value.trim() || null,
      );
      categories.value = [...categories.value, cat];
      newCatName.value = "";
      newCatIcon.value = "\u{1F4C1}";
      newCatPath.value = "";
      newCatRule.value = "";
    } catch (e) { console.error(e); }
  };

  const handleRemoveCategory = async (id: number) => {
    try {
      await removeCategory(id);
      categories.value = categories.value.filter((c) => c.id !== id);
    } catch (e) { console.error(e); }
  };

  const startEditCat = (cat: CategoryPayload) => {
    editingCat.value = cat.id;
    editCatName.value = cat.name;
    editCatIcon.value = cat.icon;
    editCatPath.value = cat.save_path || "";
    editCatRule.value = cat.auto_rule || "";
  };

  const saveEditCat = async () => {
    if (editingCat.value === null) return;
    try {
      await updateCategory(editingCat.value, editCatName.value.trim(), editCatIcon.value,
        editCatPath.value.trim() || null, editCatRule.value.trim() || null);
      categories.value = categories.value.map((c) =>
        c.id === editingCat.value
          ? { ...c, name: editCatName.value.trim(), icon: editCatIcon.value,
              save_path: editCatPath.value.trim() || null, auto_rule: editCatRule.value.trim() || null }
          : c
      );
      editingCat.value = null;
    } catch (e) { console.error(e); }
  };

  const handleAddTag = async () => {
    if (!newTagName.value.trim()) return;
    try {
      const tag = await addTag(newTagName.value.trim(), newTagColor.value, newTagRule.value.trim() || null);
      tags.value = [...tags.value, tag];
      newTagName.value = "";
      newTagColor.value = "#34d35e";
      newTagRule.value = "";
    } catch (e) { console.error(e); }
  };

  const handleRemoveTag = async (id: number) => {
    try {
      await removeTag(id);
      tags.value = tags.value.filter((t) => t.id !== id);
    } catch (e) { console.error(e); }
  };

  // Tag editing via inline edit is not implemented in this version

  const handleSetGlobalPath = async (path: string | null) => {
    try {
      await setGlobalDownloadPath(path);
      globalPath.value = path;
    } catch (e) { console.error(e); }
  };

  const globalPathInput = useSignal(globalPath.value ?? "");

  return (
    <div class="dialog-overlay" onClick={onClose}>
      <div class="dialog categories-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="dialog-header">
          <span class="dialog-title">Categories & Tags</span>
          <button class="dialog-close" onClick={onClose}>&times;</button>
        </div>

        {/* Tabs */}
        <div class="categories-tabs">
          {(["categories", "tags", "paths"] as const).map((t) => (
            <button
              key={t}
              class={`categories-tab ${tab.value === t ? "active" : ""}`}
              onClick={() => (tab.value = t)}
            >
              {t === "categories" ? "\u{1F4C1} Categories" : t === "tags" ? "\u{1F3F7} Tags" : "\u{1F4C2} Paths"}
            </button>
          ))}
        </div>

        <div class="dialog-body categories-body">
          {loading.value ? (
            <div class="categories-loading">Loading...</div>
          ) : tab.value === "categories" ? (
            <div class="categories-tab-content">
              {/* Existing categories */}
              {categories.value.length === 0 && (
                <div class="categories-empty">No categories yet. Add one below.</div>
              )}
              {categories.value.map((cat) => (
                <div key={cat.id} class="category-item">
                  {editingCat.value === cat.id ? (
                    <div class="category-edit">
                      <div class="cat-edit-row">
                        <input class="modal-input cat-icon-input" value={editCatIcon.value}
                          onInput={(e) => (editCatIcon.value = (e.target as HTMLInputElement).value)} />
                        <input class="modal-input cat-name-input" value={editCatName.value}
                          onInput={(e) => (editCatName.value = (e.target as HTMLInputElement).value)} />
                      </div>
                      <div class="cat-edit-row">
                        <span class="cat-edit-label">Save path:</span>
                        <input class="modal-input cat-path-input" value={editCatPath.value}
                          placeholder="/downloads/movies"
                          onInput={(e) => (editCatPath.value = (e.target as HTMLInputElement).value)} />
                      </div>
                      <div class="cat-edit-row">
                        <span class="cat-edit-label">Auto rule:</span>
                        <input class="modal-input cat-rule-input" value={editCatRule.value}
                          placeholder="regex, e.g. (?i)Movie"
                          onInput={(e) => (editCatRule.value = (e.target as HTMLInputElement).value)} />
                      </div>
                      <div class="cat-edit-actions">
                        <button class="btn btn-primary btn-sm" onClick={saveEditCat}>Save</button>
                        <button class="btn btn-ghost btn-sm" onClick={() => (editingCat.value = null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div class="category-display">
                      <span class="cat-icon">{cat.icon}</span>
                      <span class="cat-name">{cat.name}</span>
                      {cat.save_path && <span class="cat-path">{cat.save_path}</span>}
                      {cat.auto_rule && <span class="cat-rule">{cat.auto_rule}</span>}
                      <div class="cat-actions">
                        <button class="btn-icon" title="Edit" onClick={() => startEditCat(cat)}>
                          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 2l3 3-8 8H3v-3l8-8z"/></svg>
                        </button>
                        <button class="btn-icon danger" title="Remove" onClick={() => handleRemoveCategory(cat.id)}>
                          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4l8 8M12 4l-8 8"/></svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add new category form */}
              <div class="category-add">
                <div class="cat-edit-row">
                  <input class="modal-input cat-icon-input" value={newCatIcon.value}
                    placeholder="icon" onInput={(e) => (newCatIcon.value = (e.target as HTMLInputElement).value)} />
                  <input class="modal-input cat-name-input" value={newCatName.value}
                    placeholder="Category name" onInput={(e) => (newCatName.value = (e.target as HTMLInputElement).value)} />
                </div>
                <div class="cat-edit-row">
                  <span class="cat-edit-label">Save path:</span>
                  <input class="modal-input cat-path-input" value={newCatPath.value}
                    placeholder="/downloads/..." onInput={(e) => (newCatPath.value = (e.target as HTMLInputElement).value)} />
                </div>
                <div class="cat-edit-row">
                  <span class="cat-edit-label">Auto rule:</span>
                  <input class="modal-input cat-rule-input" value={newCatRule.value}
                    placeholder="regex" onInput={(e) => (newCatRule.value = (e.target as HTMLInputElement).value)} />
                </div>
                <button class="btn btn-primary btn-sm" onClick={handleAddCategory}
                  disabled={!newCatName.value.trim()}>Add Category</button>
              </div>
            </div>
          ) : tab.value === "tags" ? (
            <div class="categories-tab-content">
              {tags.value.length === 0 && (
                <div class="categories-empty">No tags yet. Add one below.</div>
              )}
              {tags.value.map((tag) => (
                <div key={tag.id} class="tag-item">
                  <span class="tag-badge" style={`background: ${tag.color}22; color: ${tag.color}; border-color: ${tag.color}44;`}>
                    {tag.name}
                  </span>
                  {tag.auto_rule && <span class="tag-rule">{tag.auto_rule}</span>}
                  <div class="cat-actions">
                    <button class="btn-icon danger" title="Remove" onClick={() => handleRemoveTag(tag.id)}>
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4l8 8M12 4l-8 8"/></svg>
                    </button>
                  </div>
                </div>
              ))}

              {/* Add new tag form */}
              <div class="category-add">
                <div class="cat-edit-row">
                  <input class="modal-input cat-name-input" value={newTagName.value}
                    placeholder="Tag name" onInput={(e) => (newTagName.value = (e.target as HTMLInputElement).value)} />
                  <input class="modal-input cat-rule-input" value={newTagColor.value}
                    placeholder="color hex" style="width: 80px;" onInput={(e) => (newTagColor.value = (e.target as HTMLInputElement).value)} />
                  <span class="tag-preview" style={`background: ${newTagColor.value}22; color: ${newTagColor.value};`}>
                    {newTagName.value || "Preview"}
                  </span>
                </div>
                <div class="cat-edit-row">
                  <span class="cat-edit-label">Auto rule:</span>
                  <input class="modal-input cat-rule-input" value={newTagRule.value}
                    placeholder="regex" onInput={(e) => (newTagRule.value = (e.target as HTMLInputElement).value)} />
                </div>
                <button class="btn btn-primary btn-sm" onClick={handleAddTag}
                  disabled={!newTagName.value.trim()}>Add Tag</button>
              </div>
            </div>
          ) : (
            <div class="categories-tab-content">
              <div class="path-section">
                <h4>Global Download Path</h4>
                <p class="path-desc">All torrents will be downloaded to this directory. Per-category paths override this.</p>
                <div class="path-row">
                  <input class="modal-input path-input" value={globalPathInput.value}
                    placeholder="/downloads (leave empty for default)"
                    onInput={(e) => (globalPathInput.value = (e.target as HTMLInputElement).value)} />
                  <button class="btn btn-primary btn-sm" onClick={() => handleSetGlobalPath(globalPathInput.value.trim() || null)}
                    disabled={globalPathInput.value === (globalPath.value ?? "")}>
                    Save
                  </button>
                </div>
                <div class="path-current">
                  Current: <span class="path-val">{globalPath.value || "Default (app data directory)"}</span>
                </div>
              </div>

              <div class="path-section">
                <h4>Category Paths</h4>
                <p class="path-desc">Each category can have its own download path.</p>
                {categories.value.length === 0 && (
                  <div class="categories-empty">No categories defined.</div>
                )}
                {categories.value.map((cat) => (
                  <div key={cat.id} class="cat-path-item">
                    <span class="cat-icon">{cat.icon}</span>
                    <span class="cat-name">{cat.name}</span>
                    <span class="cat-path-val">{cat.save_path || "Inherited from global"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div class="dialog-footer">
          <button class="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
