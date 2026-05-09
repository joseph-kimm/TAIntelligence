"use client";

import { useState, useLayoutEffect, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import CourseSidebar from "@/components/layout/CourseSidebar";
import CourseTabBar from "@/components/layout/CourseTabBar";
import ChatTab from "@/components/chat/ChatTab";
import SummarizeTab from "@/components/summarize/SummarizeTab";
import TestTab from "@/components/test/TestTab";
import AddDocumentModal from "@/components/modals/AddDocumentModal";
import { createChat, deleteChat } from "@/lib/actions";
import { parseSSEStream, toMessage } from "@/lib/streaming";
import styles from "./page.module.css";
import type {
  Chat,
  Course,
  CourseTab,
  Document,
  Message,
  Section,
  Summary,
} from "@/types";

interface CoursePageClientProps {
  course: Course;
  sections: Section[];
  initialChats: Chat[];
}

export default function CoursePageClient({
  course,
  sections: initialSections,
  initialChats,
}: CoursePageClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<CourseTab>("chat");
  const [sections, setSections] = useState<Section[]>(initialSections);
  const [chats, setChats] = useState<Chat[]>(initialChats);
  const [activeChatId, setActiveChatId] = useState<string | null>(
    initialChats.at(-1)?.id ?? null,
  );
  const [pendingNewChat, setPendingNewChat] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSidebarOpen(window.innerWidth >= 768);
  }, []);

  // Sync sections when the server sends fresh data after router.refresh().
  // useState(initialSections) only runs at mount; this effect keeps it in sync.
  useEffect(() => {
    setSections(initialSections);
  }, [initialSections]);

  const pendingDocIds = sections
    .flatMap((s) => s.documents)
    .filter((d) => d.ingestionStatus === "pending")
    .map((d) => d.id)
    .join(",");

  const pollStartTimesRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!pendingDocIds) return;
    const ids = pendingDocIds.split(",");

    const now = Date.now();
    ids.forEach((id) => {
      if (!pollStartTimesRef.current.has(id)) {
        pollStartTimesRef.current.set(id, now);
      }
    });

    const intervalId = setInterval(async () => {
      await Promise.all(
        ids.map(async (docId) => {
          const elapsed =
            Date.now() - (pollStartTimesRef.current.get(docId) ?? Date.now());
          if (elapsed > 3 * 60 * 1000) {
            pollStartTimesRef.current.delete(docId);
            setSections((prev) =>
              prev.map((s) => ({
                ...s,
                documents: s.documents.map((d) =>
                  d.id === docId
                    ? { ...d, ingestionStatus: "failed" as const }
                    : d,
                ),
              })),
            );
            return;
          }

          const res = await fetch(`/api/documents/${docId}/ingestion-status`);
          if (!res.ok) return;
          const { status } = await res.json();
          if (status === "complete" || status === "failed") {
            pollStartTimesRef.current.delete(docId);
            setSections((prev) =>
              prev.map((s) => ({
                ...s,
                documents: s.documents.map((d) =>
                  d.id === docId
                    ? { ...d, ingestionStatus: status as "complete" | "failed" }
                    : d,
                ),
              })),
            );
          }
        }),
      );
    }, 3000);

    return () => clearInterval(intervalId);
  }, [pendingDocIds]);

  useEffect(() => {
    fetch(`/api/courses/${course.id}/summaries`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<Record<string, unknown>>) =>
        setSummaries(
          data.map((s) => ({
            id: s.id as string,
            courseId: s.course_id as string,
            documentId: (s.document_id as string | null) ?? null,
            title: s.title as string,
            content: s.content as string,
            currentVersionNumber: (s.current_version_number as number) ?? 1,
            sourceDocumentIds: (s.source_document_ids as string[]) ?? [],
            createdAt: s.created_at as string,
          })),
        ),
      )
      .catch(() => {});
  }, [course.id]);

  function handleSummaryCreated(summary: Summary) {
    setSummaries((prev) => [summary, ...prev]);
    router.refresh();
  }

  function handleSummaryUpdated(summary: Summary) {
    setSummaries((prev) =>
      prev.map((s) => (s.id === summary.id ? summary : s)),
    );
  }

  function handleSummaryDeleted(summaryId: string) {
    setSummaries((prev) => prev.filter((s) => s.id !== summaryId));
  }

  async function handleSend(text: string) {
    let chatId = activeChatId;

    if (!chatId) {
      const newChat = await createChat(course.id);
      setChats((prev) => [...prev, { ...newChat, messages: [] }]);
      setActiveChatId(newChat.id);
      setPendingNewChat(false);
      chatId = newChat.id;
    }

    const tempUserId = `temp-user-${Date.now()}`;
    const tempAssistantId = `temp-assistant-${Date.now()}`;

    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: [
                ...c.messages,
                {
                  id: tempUserId,
                  role: "user" as const,
                  content: text,
                  chunkIds: [],
                },
                {
                  id: tempAssistantId,
                  role: "assistant" as const,
                  content: "",
                  chunkIds: [],
                },
              ],
            }
          : c,
      ),
    );

    const res = await fetch(`/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text, documentIds: [...selectedDocIds] }),
    });

    if (!res.ok || !res.body) {
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? {
                ...c,
                messages: c.messages.filter(
                  (m) => m.id !== tempUserId && m.id !== tempAssistantId,
                ),
              }
            : c,
        ),
      );
      return;
    }

    for await (const event of parseSSEStream(res.body)) {
      if (event.type === "user_message") {
        const msg = toMessage(event.message);
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === tempUserId ? msg : m,
                  ),
                }
              : c,
          ),
        );
      } else if (event.type === "delta") {
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === tempAssistantId
                      ? { ...m, content: m.content + event.content }
                      : m,
                  ),
                }
              : c,
          ),
        );
      } else if (event.type === "done") {
        const msg = toMessage(event.message);
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === tempAssistantId ? msg : m,
                  ),
                }
              : c,
          ),
        );
      } else if (event.type === "error") {
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === tempAssistantId
                      ? { ...m, content: event.message, isError: true }
                      : m,
                  ),
                }
              : c,
          ),
        );
      }
    }
  }

  function handleNewChat() {
    setActiveChatId(null);
    setPendingNewChat(true);
  }

  async function handleDeleteChat(chatId: string) {
    await deleteChat(chatId);
    setChats((prev) => {
      const remaining = prev.filter((c) => c.id !== chatId);
      setActiveChatId(remaining.at(-1)?.id ?? null);
      setPendingNewChat(false);
      return remaining;
    });
  }

  async function handleEditMessage(
    chatId: string,
    messageId: string,
    content: string,
  ) {
    const tempUserId = `temp-user-${Date.now()}`;
    const tempAssistantId = `temp-assistant-${Date.now()}`;

    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        const cutIndex = c.messages.findIndex((m) => m.id === messageId);
        return {
          ...c,
          messages: [
            ...c.messages.slice(0, cutIndex),
            { id: tempUserId, role: "user" as const, content, chunkIds: [] },
            {
              id: tempAssistantId,
              role: "assistant" as const,
              content: "",
              chunkIds: [],
            },
          ],
        };
      }),
    );

    const res = await fetch(`/api/chats/${chatId}/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, documentIds: [...selectedDocIds] }),
    });

    if (!res.ok || !res.body) {
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? {
                ...c,
                messages: c.messages.filter(
                  (m) => m.id !== tempUserId && m.id !== tempAssistantId,
                ),
              }
            : c,
        ),
      );
      return;
    }

    for await (const event of parseSSEStream(res.body)) {
      if (event.type === "user_message") {
        const msg = toMessage(event.message);
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === tempUserId ? msg : m,
                  ),
                }
              : c,
          ),
        );
      } else if (event.type === "delta") {
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === tempAssistantId
                      ? { ...m, content: m.content + event.content }
                      : m,
                  ),
                }
              : c,
          ),
        );
      } else if (event.type === "done") {
        const msg = toMessage(event.message);
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === tempAssistantId ? msg : m,
                  ),
                }
              : c,
          ),
        );
      } else if (event.type === "error") {
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === tempAssistantId
                      ? { ...m, content: event.message, isError: true }
                      : m,
                  ),
                }
              : c,
          ),
        );
      }
    }
  }

  return (
    <>
      <div className={styles.layout}>
        <CourseSidebar
          title={course.title}
          sections={sections}
          selectedDocIds={selectedDocIds}
          onSelectionChange={setSelectedDocIds}
          onAddDocument={() => setShowModal(true)}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <main className={styles.main}>
          <div className={styles.header}>
            <button
              className={styles.menuBtn}
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-label="Toggle sidebar"
            >
              <Menu size={22} />
            </button>
            <div className={styles.tabBarWrap}>
              <CourseTabBar active={activeTab} onChange={setActiveTab} />
            </div>
          </div>

          {activeTab === "chat" && (
            <ChatTab
              chats={chats}
              pendingNewChat={pendingNewChat}
              onSend={handleSend}
              onNewChat={handleNewChat}
              onDeleteChat={handleDeleteChat}
              onEditMessage={handleEditMessage}
            />
          )}
          {activeTab === "summarize" && (
            <SummarizeTab
              courseId={course.id}
              selectedDocIds={selectedDocIds}
              summaries={summaries}
              documents={sections.flatMap((s): Document[] => s.documents)}
              isGenerating={isGenerating}
              onGeneratingChange={setIsGenerating}
              onSummaryCreated={handleSummaryCreated}
              onSummaryUpdated={handleSummaryUpdated}
              onSummaryDeleted={handleSummaryDeleted}
            />
          )}
          {activeTab === "test" && (
            <TestTab config={{ mcq: 10, shortAnswer: 5, longAnswer: 2 }} />
          )}
        </main>
      </div>

      {showModal && (
        <AddDocumentModal
          courseId={course.id}
          sections={sections}
          onClose={() => setShowModal(false)}
          onSuccess={() => router.refresh()}
        />
      )}
    </>
  );
}
