"use client";

import { useRef, useState } from "react";
import {
  Upload,
  Link,
  HardDrive,
  ClipboardPaste,
  ChevronDown,
  X,
} from "lucide-react";
import styles from "./AddDocumentModal.module.css";
import { createSection } from "@/lib/actions";
import { uploadDocument } from "@/lib/uploads";
import type { Section } from "@/types";

interface AddDocumentModalProps {
  courseId: string;
  sections: Section[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddDocumentModal({
  courseId,
  sections,
  onClose,
  onSuccess,
}: AddDocumentModalProps) {
  const [name, setName] = useState("");
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "__new__");
  const [newSectionName, setNewSectionName] = useState("");
  const [uploadMode, setUploadMode] = useState<"file" | "url">("file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isNewSection = sectionId === "__new__";

  function handleFileSelect(file: File) {
    setSelectedFile(file);
    setUploadMode("file");
    // Auto-fill name from filename (strip extension) if not already set
    if (!name) {
      setName(file.name.replace(/\.[^.]+$/, ""));
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }

  async function handleSubmit() {
    setError(null);

    if (!name.trim()) {
      setError("Document name is required.");
      return;
    }
    if (isNewSection && !newSectionName.trim()) {
      setError("New section name is required.");
      return;
    }
    if (uploadMode === "file" && !selectedFile) {
      setError("Please select a file to upload.");
      return;
    }
    if (uploadMode === "url" && !url.trim()) {
      setError("Please enter a URL.");
      return;
    }

    setIsSubmitting(true);
    try {
      let targetSectionId = sectionId;
      if (isNewSection) {
        const section = await createSection(courseId, newSectionName.trim());
        targetSectionId = section.id;
      }

      const formData = new FormData();
      formData.append("section_id", targetSectionId);
      formData.append("title", name.trim());

      if (uploadMode === "file" && selectedFile) {
        formData.append("source_type", "file");
        formData.append("file", selectedFile);
      } else {
        formData.append("source_type", "website");
        formData.append("source_ref", url.trim());
      }

      await uploadDocument(formData);
      onSuccess();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className={styles.overlay}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3 className={styles.modalTitle}>Add New Document</h3>
          <p className={styles.modalSubtitle}>
            Upload a document to this section.
          </p>
        </div>

        <div className={styles.body}>
          {error && <p className={styles.errorText}>{error}</p>}

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="doc-name">
                Document Name
              </label>
              <input
                id="doc-name"
                className={styles.input}
                placeholder="e.g. Bauhaus Philosophy Summary"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="section-select">
                Section
              </label>
              <div className={styles.selectWrap}>
                <select
                  id="section-select"
                  className={styles.select}
                  value={sectionId}
                  onChange={(e) => setSectionId(e.target.value)}
                >
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                  <option value="__new__">+ Add New Section</option>
                </select>
                <ChevronDown size={18} className={styles.selectChevron} />
              </div>
              {isNewSection && (
                <input
                  className={styles.input}
                  placeholder="New section name..."
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  autoFocus
                />
              )}
            </div>
          </div>

          {uploadMode === "url" ? (
            <div className={styles.urlWrap}>
              <div className={styles.urlLabelRow}>
                <label className={styles.label} htmlFor="doc-url">
                  Website URL
                </label>
                <button
                  className={styles.clearBtn}
                  onClick={() => {
                    setUploadMode("file");
                    setUrl("");
                  }}
                  aria-label="Switch back to file upload"
                >
                  <X size={14} /> Back to file
                </button>
              </div>
              <input
                id="doc-url"
                className={styles.input}
                placeholder="https://..."
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoFocus
              />
            </div>
          ) : (
            <div
              className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              {selectedFile ? (
                <div className={styles.fileChip}>
                  <span className={styles.fileName}>{selectedFile.name}</span>
                  <button
                    className={styles.removeFileBtn}
                    onClick={() => setSelectedFile(null)}
                    aria-label="Remove file"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <p className={styles.dropLabel}>Drop your file here</p>
                  <p className={styles.dropSub}>PDF, DOCX, or TXT</p>
                </>
              )}

              <div className={styles.uploadButtons}>
                <button
                  className={styles.uploadBtn}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={18} /> Upload files
                </button>
                <button
                  className={styles.uploadBtn}
                  onClick={() => setUploadMode("url")}
                >
                  <Link size={18} /> Websites
                </button>
                <button className={styles.uploadBtn} disabled>
                  <HardDrive size={18} /> Drive
                </button>
                <button className={styles.uploadBtn} disabled>
                  <ClipboardPaste size={18} /> Copied text
                </button>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt"
            className={styles.hiddenInput}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
              // Reset so selecting the same file again fires onChange
              e.target.value = "";
            }}
          />
        </div>

        <div className={styles.footer}>
          <button
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            className={styles.createBtn}
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Uploading…" : "Add Document"}
          </button>
        </div>
      </div>
    </div>
  );
}
