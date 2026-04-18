"use client";

import { useState } from "react";
import {
  CourseCard,
  CreateCourseCard,
} from "@/components/course/CourseCard";
import CreateCourseModal from "@/components/modals/CreateCourseModal";
import styles from "./page.module.css";
import type { Course } from "@/types";

interface CourseGridProps {
  courses: Course[];
}

export default function CourseGrid({ courses }: CourseGridProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div className={styles.grid}>
        <CreateCourseCard onClick={() => setModalOpen(true)} />
        {courses.map((course) => (
          <CourseCard
            key={course.id}
            course={course}
            href={`/course/${course.id}`}
          />
        ))}
      </div>
      {modalOpen && <CreateCourseModal onClose={() => setModalOpen(false)} />}
    </>
  );
}
