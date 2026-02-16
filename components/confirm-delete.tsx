"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";

interface ConfirmDeleteProps {
  onConfirm: () => void;
  itemName?: string;
  trigger?: React.ReactNode;
}

export function ConfirmDelete({
  onConfirm,
  itemName = "this item",
  trigger,
}: ConfirmDeleteProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {trigger || (
          <button
            className="p-1 rounded hover:bg-destructive/10 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-3 w-3 text-destructive/70" />
          </button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-xs">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">Delete?</AlertDialogTitle>
          <AlertDialogDescription className="text-sm">
            Are you sure you want to delete {itemName}? This can&apos;t be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-9">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="h-9 bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
