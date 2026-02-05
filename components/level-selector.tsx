"use client"

import { motion } from "framer-motion"
import type { EducationLevel } from "@/app/page"
import { GraduationCap, School, BookOpen, University } from "lucide-react"

interface LevelSelectorProps {
  onSelectLevel: (level: EducationLevel) => void
}

const levels = [
  {
    id: "SD" as const,
    name: "SD",
    fullName: "Sekolah Dasar",
    description: "Kelas 1-6",
    icon: School,
    color: "bg-emerald-500",
    hoverColor: "hover:bg-emerald-50",
    borderColor: "hover:border-emerald-300",
  },
  {
    id: "SMP" as const,
    name: "SMP",
    fullName: "Sekolah Menengah Pertama",
    description: "Kelas 7-9",
    icon: BookOpen,
    color: "bg-blue-500",
    hoverColor: "hover:bg-blue-50",
    borderColor: "hover:border-blue-300",
  },
  {
    id: "SMA/SMK" as const,
    name: "SMA/SMK",
    fullName: "Sekolah Menengah Atas",
    description: "Kelas 10-12",
    icon: GraduationCap,
    color: "bg-amber-500",
    hoverColor: "hover:bg-amber-50",
    borderColor: "hover:border-amber-300",
  },
  {
    id: "S1" as const,
    name: "S1",
    fullName: "Sarjana / Universitas",
    description: "Perguruan Tinggi",
    icon: University,
    color: "bg-rose-500",
    hoverColor: "hover:bg-rose-50",
    borderColor: "hover:border-rose-300",
  },
]

export function LevelSelector({ onSelectLevel }: LevelSelectorProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {levels.map((level, index) => {
        const Icon = level.icon
        return (
          <motion.button
            key={level.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectLevel(level.id)}
            className={`group relative overflow-hidden rounded-2xl border-2 border-border bg-card p-6 text-left transition-all ${level.hoverColor} ${level.borderColor}`}
          >
            <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${level.color}`}>
              <Icon className="h-6 w-6 text-primary-foreground" />
            </div>
            <h3 
              className="mb-1 text-xl font-bold text-foreground"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {level.name}
            </h3>
            <p className="mb-1 text-sm font-medium text-foreground/80">{level.fullName}</p>
            <p className="text-xs text-muted-foreground">{level.description}</p>
            
            {/* Decorative element */}
            <div className={`absolute -right-4 -top-4 h-24 w-24 rounded-full ${level.color} opacity-10 transition-transform group-hover:scale-150`} />
          </motion.button>
        )
      })}
    </div>
  )
}
