"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ScrollText,
  Sparkles,
  Clock,
  X,
  Loader2,
  Trash2,
  Send,
  Plus,
  Pencil,
} from "lucide-react";
import styles from "./SummarizeTab.module.css";
import NewSummaryPanel from "./NewSummaryPanel";
import { DEFAULT_OPTIONS } from "./SummaryOptionsPanel";
import type {
  Document,
  Summary,
  SummaryOptions,
  SummaryVersion,
  SummaryVersionDetail,
} from "@/types";

interface SummarizeTabProps {
  courseId: string;
  selectedDocIds: Set<string>;
  summaries: Summary[];
  documents: Document[];
  isGenerating: boolean;
  onGeneratingChange: (v: boolean) => void;
  onSummaryCreated: (summary: Summary) => void;
  onSummaryUpdated: (summary: Summary) => void;
  onSummaryDeleted: (summaryId: string) => void;
}

export default function SummarizeTab({
  courseId,
  selectedDocIds,
  summaries,
  documents,
  isGenerating,
  onGeneratingChange,
  onSummaryCreated,
  onSummaryUpdated,
  onSummaryDeleted,
}: SummarizeTabProps) {
  const [historyVisible, setHistoryVisible] = useState(false);
  const [activeSummary, setActiveSummary] = useState<Summary | null>(null);
  const [newSummaryMode, setNewSummaryMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refineInput, setRefineInput] = useState("");
  const [refining, setRefining] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [options, setOptions] = useState<SummaryOptions>(DEFAULT_OPTIONS);
  const [versions, setVersions] = useState<SummaryVersion[]>([]);
  const [viewingVersionId, setViewingVersionId] = useState<string | null>(null);
  const [viewingContent, setViewingContent] = useState<string | null>(null);
  const [loadingVersion, setLoadingVersion] = useState(false);
  const navigatedAwayRef = useRef(false);

  const docTitleMap = useMemo(
    () => new Map(documents.map((d) => [d.id, d.title])),
    [documents],
  );

  useEffect(() => {
    setVersions([]);
    setViewingVersionId(null);
    setViewingContent(null);
    setRefineOpen(false);
    setRefineInput("");
    if (!activeSummary) return;
    fetch(`/api/summaries/${activeSummary.id}/versions`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: unknown[]) => setVersions(data.map(toSummaryVersion)))
      .catch(() => {});
  }, [activeSummary?.id]);

  function handleHistoryItemClick(item: Summary) {
    if (isGenerating) navigatedAwayRef.current = true;
    setActiveSummary(item);
    setNewSummaryMode(false);
    setHistoryVisible(false);
    setError(null);
  }

  async function handleSummarize() {
    if (selectedDocIds.size === 0 || isGenerating) return;
    navigatedAwayRef.current = false;
    onGeneratingChange(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${courseId}/summaries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_ids: [...selectedDocIds],
          options: {
            detail_level: options.detailLevel,
            length_auto: options.lengthAuto,
            length_minutes: options.lengthMinutes,
            audience: options.audience,
            style: options.style,
            tone: options.tone,
            focus_emphasis: options.focusEmphasis,
          },
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const summary = toSummary(await res.json());
      onSummaryCreated(summary);
      if (!navigatedAwayRef.current) {
        setActiveSummary(summary);
        setNewSummaryMode(false);
      }
    } catch {
      setError("Failed to generate summary. Please try again.");
    } finally {
      onGeneratingChange(false);
    }
  }

  async function handleRefine() {
    if (
      !activeSummary ||
      !refineInput.trim() ||
      refining ||
      viewingVersionId !== null
    )
      return;
    setRefining(true);
    const instruction = refineInput.trim();
    setRefineInput("");
    setError(null);
    try {
      const res = await fetch(`/api/summaries/${activeSummary.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const updated = toSummary(await res.json());
      setActiveSummary(updated);
      onSummaryUpdated(updated);
      const versionsRes = await fetch(
        `/api/summaries/${activeSummary.id}/versions`,
      );
      if (versionsRes.ok) {
        const data: unknown[] = await versionsRes.json();
        setVersions(data.map(toSummaryVersion));
      }
      setRefineOpen(false);
    } catch {
      setError("Failed to refine summary. Please try again.");
    } finally {
      setRefining(false);
    }
  }

  async function handleVersionChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (!activeSummary) return;
    const versionId = e.target.value;
    if (versionId === versions[0]?.id) {
      setViewingVersionId(null);
      setViewingContent(null);
      return;
    }
    setLoadingVersion(true);
    setViewingVersionId(versionId);
    try {
      const res = await fetch(
        `/api/summaries/${activeSummary.id}/versions/${versionId}`,
      );
      if (!res.ok) throw new Error();
      const data = (await res.json()) as SummaryVersionDetail;
      setViewingContent(data.content);
    } catch {
      setViewingVersionId(null);
      setViewingContent(null);
    } finally {
      setLoadingVersion(false);
    }
  }

  async function handleDelete(summary: Summary) {
    try {
      const res = await fetch(`/api/summaries/${summary.id}`, {
        method: "DELETE",
      });
      if (!res.ok) return;
      onSummaryDeleted(summary.id);
      if (activeSummary?.id === summary.id) {
        setActiveSummary(null);
        setNewSummaryMode(false);
      }
    } catch {
      // silently ignore
    }
  }

  function handleRefineKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleRefine();
    }
  }

  const docCount = selectedDocIds.size;
  const selectedDocs = documents.filter((d) => selectedDocIds.has(d.id));
  const canSummarize = docCount > 0 && !isGenerating;
  const isViewingOldVersion = viewingVersionId !== null;
  const displayContent = viewingContent ?? activeSummary?.content ?? "";

  const showNewSummaryForm = newSummaryMode && !isGenerating;
  const showGeneratingSpinner = newSummaryMode && isGenerating;
  const showSummaryContent = !newSummaryMode && activeSummary !== null;
  const showEmptyState =
    !newSummaryMode && activeSummary === null && !isGenerating;

  return (
    <div className={styles.container}>
      {historyVisible && (
        <div
          className={styles.historyOverlay}
          onClick={() => setHistoryVisible(false)}
        />
      )}

      {/* Left panel */}
      <aside
        className={`${styles.history} ${historyVisible ? styles.historyVisible : ""}`}
      >
        <div className={styles.historyHeader}>
          <span className={styles.historyLabel}>History</span>
          <button
            className={styles.historyCloseBtn}
            onClick={() => setHistoryVisible(false)}
          >
            <X size={16} />
          </button>
        </div>

        <button
          className={`${styles.newSummaryBtn} ${newSummaryMode ? styles.newSummaryBtnActive : ""}`}
          onClick={() => {
            setNewSummaryMode(true);
            setHistoryVisible(false);
          }}
        >
          <Plus size={13} />
          New Summary
        </button>

        <div className={styles.historyList}>
          {isGenerating && (
            <div className={styles.generatingItem}>
              <Loader2 size={12} className={styles.spinIcon} />
              <span>Generating…</span>
            </div>
          )}
          {summaries.length === 0 && !isGenerating && (
            <p className={styles.historyEmpty}>No summaries yet.</p>
          )}
          {summaries.map((item) => (
            <div
              key={item.id}
              className={`${styles.historyItem} ${activeSummary?.id === item.id && !newSummaryMode ? styles.historyItemActive : ""}`}
            >
              <button
                className={styles.historyItemBtn}
                onClick={() => handleHistoryItemClick(item)}
              >
                {refining && activeSummary?.id === item.id ? (
                  <Loader2
                    size={30}
                    className={styles.spinIcon}
                    color="var(--primary)"
                  />
                ) : (
                  <ScrollText
                    size={30}
                    color={
                      activeSummary?.id === item.id && !newSummaryMode
                        ? "var(--primary)"
                        : "var(--on-surface-variant)"
                    }
                  />
                )}
                <div className={styles.historyItemMeta}>
                  <span className={styles.historyItemTitle}>{item.title}</span>
                  {item.sourceDocumentIds.length > 0 && (
                    <div className={styles.historyItemDocChips}>
                      {item.sourceDocumentIds.map((id) => (
                        <span key={id} className={styles.historyItemDocChip}>
                          {docTitleMap.get(id) ?? "Document"}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
              <button
                className={styles.historyDeleteBtn}
                onClick={() => handleDelete(item)}
                aria-label="Delete summary"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Right panel */}
      <div className={styles.viewer}>
        {/* Top bar */}
        <div className={styles.viewerTopBar}>
          <button
            className={styles.historyToggleBtn}
            onClick={() => setHistoryVisible(true)}
          >
            <Clock size={14} />
            History
          </button>

          {showSummaryContent && (
            <div className={styles.docInfo}>
              <div className={styles.docIcon}>
                {refining || loadingVersion ? (
                  <Loader2
                    size={18}
                    color="var(--primary)"
                    className={styles.spinIcon}
                  />
                ) : (
                  <ScrollText size={18} color="var(--primary)" />
                )}
              </div>
              <div className={styles.docInfoText}>
                <p className={styles.docName}>{activeSummary.title}</p>
                <p className={styles.docMeta}>
                  {refining
                    ? "Refining…"
                    : `${activeSummary.sourceDocumentIds.length} source document${activeSummary.sourceDocumentIds.length !== 1 ? "s" : ""}`}
                </p>
              </div>
            </div>
          )}

          {(showNewSummaryForm || showGeneratingSpinner) && (
            <span className={styles.viewerModeLabel}>
              {showGeneratingSpinner ? (
                <>
                  <Loader2 size={14} className={styles.spinIcon} /> Generating…
                </>
              ) : (
                <>
                  <Plus size={14} /> New Summary
                </>
              )}
            </span>
          )}
        </div>

        {/* Meta bar: version select + source chips */}
        {showSummaryContent && (
          <div className={styles.metaBar}>
            {versions.length > 0 && (
              <select
                className={styles.versionSelect}
                value={viewingVersionId ?? versions[0]?.id ?? ""}
                onChange={handleVersionChange}
                disabled={loadingVersion || refining}
                aria-label="Select version"
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.versionNumber} — {formatVersionDate(v.createdAt)}
                  </option>
                ))}
              </select>
            )}
            <div className={styles.sourceChips}>
              {activeSummary.sourceDocumentIds.map((id) => (
                <span
                  key={id}
                  className={styles.sourceChip}
                  title={docTitleMap.get(id)}
                >
                  {docTitleMap.get(id) ?? "Document"}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        <div className={styles.docContent}>
          <div className={styles.docInner}>
            {error && <p className={styles.errorText}>{error}</p>}

            {showGeneratingSpinner && (
              <div className={styles.loadingState}>
                <Loader2
                  size={32}
                  className={styles.spinIcon}
                  color="var(--primary)"
                />
                <p className={styles.loadingText}>Generating summary…</p>
              </div>
            )}

            {showNewSummaryForm && (
              <NewSummaryPanel
                selectedDocs={selectedDocs}
                canGenerate={canSummarize}
                isGenerating={isGenerating}
                options={options}
                onOptionsChange={setOptions}
                onGenerate={handleSummarize}
              />
            )}

            {showSummaryContent && (
              <>
                <h1 className={styles.docTitle}>{activeSummary.title}</h1>
                <div className={styles.summaryContent}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {displayContent}
                  </ReactMarkdown>
                </div>
              </>
            )}

            {showEmptyState && (
              <div className={styles.emptyState}>
                <Sparkles size={40} color="var(--primary)" strokeWidth={1.5} />
                <p className={styles.emptyTitle}>Ready to summarize</p>
                <p className={styles.emptyBody}>
                  Click <strong>New Summary</strong> to get started.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Floating refine drawer — sits above bottom bar in normal flow */}
        {refineOpen && showSummaryContent && !isViewingOldVersion && (
          <div className={styles.refineDrawer}>
            <div className={styles.refineDrawerRow}>
              <textarea
                className={styles.refineTextarea}
                placeholder="e.g. make it shorter, focus on key concepts…"
                value={refineInput}
                onChange={(e) => setRefineInput(e.target.value)}
                onKeyDown={handleRefineKey}
                disabled={refining}
                rows={2}
                autoFocus
              />
              <div className={styles.refineDrawerActions}>
                <button
                  className={styles.refineSendBtn}
                  onClick={handleRefine}
                  disabled={!refineInput.trim() || refining}
                  aria-label="Send"
                >
                  {refining ? (
                    <Loader2 size={14} className={styles.spinIcon} />
                  ) : (
                    <Send size={14} />
                  )}
                </button>
                <button
                  className={styles.refineCloseBtn}
                  onClick={() => {
                    setRefineOpen(false);
                    setRefineInput("");
                  }}
                  disabled={refining}
                  aria-label="Close"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom bar */}
        {showSummaryContent && !isViewingOldVersion && (
          <div className={styles.viewerBottomBar}>
            <button
              className={`${styles.editBtn} ${refineOpen ? styles.editBtnActive : ""}`}
              onClick={() => {
                setRefineOpen((o) => !o);
                if (refineOpen) setRefineInput("");
              }}
              disabled={refining}
            >
              {refining ? (
                <Loader2 size={13} className={styles.spinIcon} />
              ) : (
                <Pencil size={13} />
              )}
              {refining ? "Refining…" : refineOpen ? "Cancel" : "Edit"}
            </button>
          </div>
        )}

        <footer className={styles.viewerFooter}>T(AI)</footer>
      </div>
    </div>
  );
}

function toSummary(raw: Record<string, unknown>): Summary {
  return {
    id: raw.id as string,
    courseId: raw.course_id as string,
    title: raw.title as string,
    content: raw.content as string,
    currentVersionNumber: (raw.current_version_number as number) ?? 1,
    sourceDocumentIds: (raw.source_document_ids as string[]) ?? [],
    createdAt: raw.created_at as string,
  };
}

function toSummaryVersion(raw: unknown): SummaryVersion {
  const r = raw as Record<string, unknown>;
  return {
    id: r.id as string,
    summaryId: r.summary_id as string,
    versionNumber: r.version_number as number,
    createdAt: r.created_at as string,
  };
}

function formatVersionDate(isoDate: string): string {
  const d = new Date(isoDate);
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}
