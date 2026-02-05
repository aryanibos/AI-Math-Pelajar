"use client"

import type { UIMessage } from "ai"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, CheckCircle, ImageIcon, FileText, Sparkles } from "lucide-react"
import type { EducationLevel } from "@/app/page"
import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"

interface SolutionDisplayProps {
  messages: UIMessage[]
  isLoading: boolean
  level: NonNullable<EducationLevel>
  imagePreview?: string | null
  textInput?: string
}

const levelColors = {
  SD: "text-emerald-600",
  SMP: "text-blue-600",
  "SMA/SMK": "text-amber-600",
  S1: "text-rose-600",
}

export function SolutionDisplay({ 
  messages, 
  isLoading, 
  level,
  imagePreview,
  textInput 
}: SolutionDisplayProps) {
  const userMessage = messages.find(m => m.role === "user")
  const assistantMessage = messages.find(m => m.role === "assistant")

  const preprocessLatex = (text: string): string => {
    // Convert various LaTeX formats to standard $$ and $ format
    let processed = text
    
    // Convert \[ ... \] to $$ ... $$
    processed = processed.replace(/\\\[/g, '$$')
    processed = processed.replace(/\\\]/g, '$$')
    
    // Convert [ ... ] (standalone math blocks) to $$ ... $$
    // This handles cases like [ \frac{2x}{2} = \frac{10}{2} ]
    processed = processed.replace(/^\[\s*(.+?)\s*\]$/gm, '$$$$$1$$$$')
    processed = processed.replace(/\n\[\s*(.+?)\s*\]\n/g, '\n$$$$$1$$$$\n')
    
    // Convert \( ... \) to $ ... $
    processed = processed.replace(/\\\(/g, '$')
    processed = processed.replace(/\\\)/g, '$')
    
    return processed
  }

  const getAssistantText = () => {
    if (!assistantMessage?.parts) return ""
    const rawText = assistantMessage.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map(p => p.text)
      .join("")
    return preprocessLatex(rawText)
  }

  const solutionText = getAssistantText()

  return (
    <div className="space-y-6">
      {/* User Input Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-primary" />
            <span style={{ fontFamily: 'var(--font-display)' }}>Soal yang Diajukan</span>
            <span className={`ml-auto text-sm ${levelColors[level]}`}>
              {level}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {imagePreview && (
            <div className="overflow-hidden rounded-xl border border-border bg-background">
              <img
                src={imagePreview || "/placeholder.svg"}
                alt="Soal"
                className="mx-auto max-h-[200px] w-auto object-contain"
              />
            </div>
          )}
          {textInput && (
            <p className="text-foreground">{textInput}</p>
          )}
        </CardContent>
      </Card>

      {/* Solution Card */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border bg-muted/50 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span style={{ fontFamily: 'var(--font-display)' }}>Sedang Mengerjakan...</span>
              </>
            ) : (
              <>
                <CheckCircle className="h-5 w-5 text-secondary" />
                <span style={{ fontFamily: 'var(--font-display)' }}>Penyelesaian</span>
                <Sparkles className="ml-auto h-4 w-4 text-accent-foreground" />
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {isLoading && !solutionText ? (
            <div className="flex flex-col items-center justify-center py-12">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
              >
                <Sparkles className="h-8 w-8 text-primary" />
              </motion.div>
              <p className="text-muted-foreground">AI sedang menganalisis soal...</p>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="prose prose-slate dark:prose-invert max-w-none"
            >
              <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  h1: ({ children }) => (
                    <h1 className="mb-4 text-xl font-bold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="mb-3 mt-6 text-lg font-bold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="mb-2 mt-4 text-base font-semibold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
                      {children}
                    </h3>
                  ),
                  p: ({ children }) => (
                    <p className="mb-3 text-foreground leading-relaxed">{children}</p>
                  ),
                  ul: ({ children }) => (
                    <ul className="mb-4 ml-4 list-disc space-y-2 text-foreground">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="mb-4 ml-4 list-decimal space-y-2 text-foreground">{children}</ol>
                  ),
                  li: ({ children }) => (
                    <li className="text-foreground">{children}</li>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-bold text-primary">{children}</strong>
                  ),
                  code: ({ children }) => (
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground">
                      {children}
                    </code>
                  ),
                  pre: ({ children }) => (
                    <pre className="mb-4 overflow-x-auto rounded-lg bg-muted p-4">
                      {children}
                    </pre>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="mb-4 border-l-4 border-primary bg-primary/5 py-2 pl-4 italic text-foreground">
                      {children}
                    </blockquote>
                  ),
                }}
              >
                {solutionText}
              </ReactMarkdown>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Tips Card */}
      {!isLoading && solutionText && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-accent/30 bg-accent/10">
            <CardContent className="p-4">
              <p className="text-sm text-accent-foreground">
                <strong style={{ fontFamily: 'var(--font-display)' }}>Tips:</strong> Pelajari setiap langkah dengan teliti. 
                Jika ada yang kurang jelas, kamu bisa mengajukan soal baru dengan keterangan yang lebih spesifik!
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  )
}
