"use client";

import { useState, useLayoutEffect, useEffect } from "react";
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
  Message,
  Section,
  SummaryHistoryItem,
} from "@/types";

const PLACEHOLDER_HISTORY: SummaryHistoryItem[] = [
  {
    id: "h1",
    title: "Summary",
    preview: "Summaries will appear here once generated.",
  },
];

interface CoursePageClientProps {
  course: Course;
  sections: Section[];
  initialChats: Chat[];
}

export default function CoursePageClient({
  course,
  sections,
  initialChats,
}: CoursePageClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<CourseTab>("chat");
  const [chats, setChats] = useState<Chat[]>(initialChats);
  const [activeChatId, setActiveChatId] = useState<string | null>(
    initialChats.at(-1)?.id ?? null,
  );
  const [pendingNewChat, setPendingNewChat] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSidebarOpen(window.innerWidth >= 768);
  }, []);

  const hasPendingDocs = sections.some((s) =>
    s.documents.some((d) => d.ingestionStatus === 'pending')
  );

  useEffect(() => {
    if (!hasPendingDocs) return;
    const id = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(id);
  }, [hasPendingDocs, router]);

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
                { id: tempUserId, role: "user" as const, content: text, chunkIds: [] },
                { id: tempAssistantId, role: "assistant" as const, content: "", chunkIds: [] },
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
            ? { ...c, messages: c.messages.filter((m) => m.id !== tempUserId && m.id !== tempAssistantId) }
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
              ? { ...c, messages: c.messages.map((m) => (m.id === tempUserId ? msg : m)) }
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
        const msg = toMessage(event.message, event.citations);
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? { ...c, messages: c.messages.map((m) => (m.id === tempAssistantId ? msg : m)) }
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

  async function handleEditMessage(chatId: string, messageId: string, content: string) {
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
            { id: tempAssistantId, role: "assistant" as const, content: "", chunkIds: [] },
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
            ? { ...c, messages: c.messages.filter((m) => m.id !== tempUserId && m.id !== tempAssistantId) }
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
              ? { ...c, messages: c.messages.map((m) => (m.id === tempUserId ? msg : m)) }
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
        const msg = toMessage(event.message, event.citations);
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? { ...c, messages: c.messages.map((m) => (m.id === tempAssistantId ? msg : m)) }
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
              history={PLACEHOLDER_HISTORY}
              activeId="h1"
              documentTitle="Select a document"
              documentMeta=""
              documentContent={
                <p
                  style={{
                    color: "var(--on-surface-variant)",
                    lineHeight: 1.75,
                  }}
                >
                  Document content will be loaded from the database.
                </p>
              }
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
