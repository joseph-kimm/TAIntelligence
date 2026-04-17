"use client";

import { useState, useLayoutEffect } from "react";
import { Menu } from "lucide-react";
import CourseSidebar from "@/components/layout/CourseSidebar";
import CourseTabBar from "@/components/layout/CourseTabBar";
import ChatTab from "@/components/course/ChatTab";
import SummarizeTab from "@/components/course/SummarizeTab";
import TestTab from "@/components/course/TestTab";
import AddNoteModal from "@/components/modals/AddNoteModal";
import styles from "./page.module.css";
import type {
  Course,
  CourseTab,
  Section,
  Message,
  SummaryHistoryItem,
} from "@/types";

// Placeholder data kept here until chat/summarize features are connected to the backend
const PLACEHOLDER_MESSAGES: Message[] = [
  {
    id: "m1",
    role: "assistant",
    content: "Welcome back! What would you like to focus on today?",
  },
];

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
}

// All interactive state lives here — tabs, sidebar open/close, modal, messages.
// This component receives already-fetched data from the Server Component parent.
export default function CoursePageClient({
  course,
  sections,
}: CoursePageClientProps) {
  const [activeTab, setActiveTab] = useState<CourseTab>("chat");
  const [messages, setMessages] = useState<Message[]>(PLACEHOLDER_MESSAGES);
  const [showModal, setShowModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // useLayoutEffect runs after the DOM is painted — used here to set the
  // sidebar's initial open/closed state based on window width without a flash.
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSidebarOpen(window.innerWidth >= 768);
  }, []);

  function handleSend(text: string) {
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), role: "user", content: text },
    ]);
  }

  return (
    <>
      <div className={styles.layout}>
        <CourseSidebar
          title={course.title}
          sections={sections}
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
            <ChatTab messages={messages} onSend={handleSend} />
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
        <AddNoteModal
          sections={sections}
          onClose={() => setShowModal(false)}
          onCreate={() => setShowModal(false)}
        />
      )}
    </>
  );
}
