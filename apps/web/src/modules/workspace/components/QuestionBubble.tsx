// The user's question as a right-aligned bubble; shared by finished answers and the pending state.
export function QuestionBubble({ children }: { children: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-2.5 text-base text-foreground [overflow-wrap:anywhere] sm:max-w-[70%]">
        {children}
      </p>
    </div>
  );
}
