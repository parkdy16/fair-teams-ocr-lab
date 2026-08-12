import * as React from "react";

import { AlertDialogContent } from "@/components/ui/alert-dialog";
import { DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const StripesSheetContent = React.forwardRef<
  React.ElementRef<typeof DialogContent>,
  React.ComponentPropsWithoutRef<typeof DialogContent>
>(({ className, ...props }, ref) => (
  <DialogContent
    ref={ref}
    className={cn(
      "fixed bottom-2 left-2 right-2 top-auto w-auto max-w-none translate-x-0 translate-y-0 rounded-[2rem] p-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-md sm:-translate-x-1/2",
      className,
    )}
    {...props}
  />
));
StripesSheetContent.displayName = "StripesSheetContent";

const StripesEditorContent = React.forwardRef<
  React.ElementRef<typeof DialogContent>,
  React.ComponentPropsWithoutRef<typeof DialogContent>
>(({ className, ...props }, ref) => (
  <DialogContent
    ref={ref}
    className={cn(
      "fixed bottom-2 left-2 right-2 top-auto max-h-[88dvh] w-auto max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-[2rem] p-4 sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 lg:max-w-xl lg:p-6",
      className,
    )}
    {...props}
  />
));
StripesEditorContent.displayName = "StripesEditorContent";

const StripesConfirmContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogContent>,
  React.ComponentPropsWithoutRef<typeof AlertDialogContent>
>(({ className, ...props }, ref) => (
  <AlertDialogContent
    ref={ref}
    className={cn("stripes-type-ui max-w-xs rounded-xl", className)}
    {...props}
  />
));
StripesConfirmContent.displayName = "StripesConfirmContent";

const StripesWorkspaceContent = React.forwardRef<
  React.ElementRef<typeof DialogContent>,
  React.ComponentPropsWithoutRef<typeof DialogContent>
>(({ className, ...props }, ref) => (
  <DialogContent
    ref={ref}
    className={cn(
      "stripes-type-ui fixed inset-0 flex h-[100dvh] max-h-none w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-none sm:inset-3 sm:h-[calc(100dvh-1.5rem)] sm:w-auto sm:rounded-[2rem] sm:border sm:border-slate-200 sm:shadow-2xl lg:left-1/2 lg:right-auto lg:top-1/2 lg:h-[min(86dvh,52rem)] lg:w-[min(46rem,calc(100vw-3rem))] lg:-translate-x-1/2 lg:-translate-y-1/2",
      className,
    )}
    {...props}
  />
));
StripesWorkspaceContent.displayName = "StripesWorkspaceContent";

export {
  StripesConfirmContent,
  StripesEditorContent,
  StripesSheetContent,
  StripesWorkspaceContent,
};
