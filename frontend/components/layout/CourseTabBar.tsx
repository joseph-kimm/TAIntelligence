import styles from './CourseTabBar.module.css'
import type { CourseTab } from '@/types'

interface CourseTabBarProps {
  active: CourseTab
  onChange: (tab: CourseTab) => void
}

const TABS: { key: CourseTab; label: string }[] = [
  { key: 'chat', label: 'Chat' },
  { key: 'summarize', label: 'Summarize' },
  { key: 'test', label: 'Test' },
]

export default function CourseTabBar({ active, onChange }: CourseTabBarProps) {
  return (
    <div className={styles.tabBar}>
      {TABS.map((tab) => (
        <button
          key={tab.key}
          className={`${styles.tab} ${active === tab.key ? styles.tabActive : ''}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
