import { FormatterApp } from "@/components/formatter-app"
import { ErrorBoundary } from "@/components/error-boundary"
import { LayoutWrapper } from "@/components/layout-wrapper"

export default function Page() {
  return (
    <LayoutWrapper currentPage="/">
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Complete Voter Data Processing</h1>
          <p className="text-muted-foreground">
            Upload PDF → Extract & Translate → Match with Database → Export Final Excel
          </p>
        </div>
        
        <ErrorBoundary>
          <FormatterApp />
        </ErrorBoundary>
      </div>
    </LayoutWrapper>
  )
}
