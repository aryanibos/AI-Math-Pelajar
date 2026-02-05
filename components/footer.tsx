"use client"

export function Footer() {
  return (
    <footer className="border-t border-border bg-background px-4 py-6 md:px-8 lg:px-16">
      <div className="mx-auto max-w-6xl text-center">
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} MathGenius. Created by{" "}
          <span className="font-semibold text-foreground">Arya Isnaidi</span>
        </p>
      </div>
    </footer>
  )
}
