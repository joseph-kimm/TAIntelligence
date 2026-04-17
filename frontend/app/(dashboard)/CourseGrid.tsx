"use client";

import {
  CourseCard,
  CreateCourseCard,
} from "@/components/course/CourseCard";
import styles from "./page.module.css";
import type { Course } from "@/types";

interface CourseGridProps {
  courses: Course[];
}

// Client Component — handles the onClick on CreateCourseCard.
// Receives already-fetched courses from the Server Component parent.
export default function CourseGrid({ courses }: CourseGridProps) {
  return (
    <div className={styles.grid}>
      <CreateCourseCard onClick={() => {}} />
      {courses.map((course) => (
        <CourseCard
          key={course.id}
          course={course}
          href={`/course/${course.id}`}
        />
      ))}
    </div>
  );
}
