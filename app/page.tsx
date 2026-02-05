"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { LevelSelector } from "@/components/level-selector"
import { MathSolver } from "@/components/math-solver"
import { Calculator, Sparkles } from "lucide-react"
import { Footer } from "@/components/footer"

export type EducationLevel = "SD" | "SMP" | "SMA/SMK" | "S1" | null

export default function Home() {
  const [selectedLevel, setSelectedLevel] = useState<EducationLevel>(null)

  return (
    <main className="min-h-screen bg-background">
      <AnimatePresence mode="wait">
        {!selectedLevel ? (
          <motion.div
            key="selector"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {/* Header */}
            <header className="px-4 py-6 md:px-8 lg:px-16">
              <div className="mx-auto max-w-6xl">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary">
                    <Calculator className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
                      MathGenius
                    </h1>
                    <p className="text-sm text-muted-foreground">AI Pemecah Soal Matematika</p>
                  </div>
                </div>
              </div>
            </header>

            {/* Hero Section */}
            <section className="px-4 py-8 md:px-8 md:py-16 lg:px-16">
              <div className="mx-auto max-w-6xl text-center">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary"
                >
                  <Sparkles className="h-4 w-4" />
                  Powered by AI
                </motion.div>
                
                <motion.h2
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mb-4 text-3xl font-bold text-foreground md:text-5xl lg:text-6xl"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Selesaikan Soal Matematika
                  <br />
                  <span className="text-primary">dengan Mudah!</span>
                </motion.h2>
                
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="mx-auto mb-12 max-w-2xl text-lg text-muted-foreground"
                >
                  Upload foto soal, ambil gambar dengan kamera, atau ketik langsung.
                  AI kami akan membantu menyelesaikan dan menjelaskan langkah demi langkah.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <p className="mb-6 text-lg font-semibold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
                    Pilih Tingkat Pendidikan Kamu
                  </p>
                  <LevelSelector onSelectLevel={setSelectedLevel} />
                </motion.div>
              </div>
            </section>

            {/* Features */}
            <section className="border-t border-border bg-card px-4 py-12 md:px-8 lg:px-16">
              <div className="mx-auto max-w-6xl">
                <div className="grid gap-6 md:grid-cols-3">
                  {[
                    {
                      title: "Upload Gambar",
                      description: "Unggah foto soal matematika dari galeri",
                      icon: "📷",
                    },
                    {
                      title: "Ambil Foto",
                      description: "Gunakan kamera untuk mengambil foto soal",
                      icon: "📸",
                    },
                    {
                      title: "Ketik Soal",
                      description: "Tulis soal matematika langsung di teks",
                      icon: "✏️",
                    },
                  ].map((feature, index) => (
                    <motion.div
                      key={feature.title}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 + index * 0.1 }}
                      className="rounded-2xl border border-border bg-background p-6 text-center"
                    >
                      <div className="mb-4 text-4xl">{feature.icon}</div>
                      <h3 className="mb-2 text-lg font-bold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
                        {feature.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">{feature.description}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </section>

            <Footer />
          </motion.div>
        ) : (
          <motion.div
            key="solver"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <MathSolver level={selectedLevel} onBack={() => setSelectedLevel(null)} />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
