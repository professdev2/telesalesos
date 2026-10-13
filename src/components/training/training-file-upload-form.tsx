"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  FieldError,
  FormAlert,
  SubmitButton,
} from "@/components/auth/form-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleFormState, type AuthFormState } from "@/lib/auth/validation";
import {
  prepareTrainingFileUploadAction,
  registerTrainingFileAction,
} from "@/lib/training/actions";
import { createClient } from "@/lib/supabase/client";
import {
  ALLOWED_TRAINING_UPLOAD_TYPES,
  MAX_TRAINING_UPLOAD_BYTES,
} from "@/lib/training/validation";

export function TrainingFileUploadForm({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<AuthFormState>(idleFormState);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const title = String(formData.get("title") ?? "");
    const file = formData.get("file");

    startTransition(async () => {
      setState(idleFormState);

      if (!(file instanceof File) || file.size === 0) {
        setState({
          status: "error",
          message: "Please correct the highlighted fields.",
          fieldErrors: { file: ["Choose a PDF or document to upload."] },
        });
        return;
      }
      if (file.size > MAX_TRAINING_UPLOAD_BYTES) {
        setState({
          status: "error",
          message: "Please correct the highlighted fields.",
          fieldErrors: { file: ["File must be 50 MB or smaller."] },
        });
        return;
      }
      const contentType = file.type || "application/octet-stream";
      if (!ALLOWED_TRAINING_UPLOAD_TYPES.has(contentType)) {
        setState({
          status: "error",
          message: "Please correct the highlighted fields.",
          fieldErrors: {
            file: ["Upload a PDF, Word, Excel, or plain text file."],
          },
        });
        return;
      }

      const prepared = await prepareTrainingFileUploadAction({
        lessonId,
        title,
        fileName: file.name,
        contentType,
        byteSize: file.size,
      });
      if (!prepared.ok) {
        setState(prepared.state);
        return;
      }

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("training-files")
        .upload(prepared.objectPath, file, {
          contentType: prepared.contentType,
          upsert: false,
        });

      if (uploadError) {
        setState({
          status: "error",
          message: uploadError.message || "Upload failed. Try again.",
        });
        return;
      }

      const registered = await registerTrainingFileAction({
        lessonId: prepared.lessonId,
        title: prepared.title,
        objectPath: prepared.objectPath,
        contentType: prepared.contentType,
        byteSize: prepared.byteSize,
        sortOrder: prepared.sortOrder,
      });
      setState(registered);
      if (registered.status === "success") {
        formRef.current?.reset();
        router.refresh();
      }
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="flex flex-wrap items-end gap-2"
    >
      <FormAlert state={state} />
      <div className="min-w-[8rem] flex-1 space-y-1">
        <Label htmlFor="upload-title" className="text-xs">
          Upload title
        </Label>
        <Input
          id="upload-title"
          name="title"
          required
          placeholder="FE script PDF"
          aria-describedby="upload-title-error"
          disabled={pending}
        />
        <FieldError
          id="upload-title-error"
          errors={state.fieldErrors?.title}
        />
      </div>
      <div className="min-w-[12rem] flex-[1.5] space-y-1">
        <Label htmlFor="upload-file" className="text-xs">
          PDF / doc (max 50 MB)
        </Label>
        <Input
          id="upload-file"
          name="file"
          type="file"
          required
          accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          aria-describedby="upload-file-error"
          className="h-auto py-1.5"
          disabled={pending}
        />
        <FieldError id="upload-file-error" errors={state.fieldErrors?.file} />
      </div>
      <SubmitButton
        pendingLabel="Uploading..."
        className="w-auto"
        disabled={pending}
      >
        {pending ? "Uploading..." : "Upload file"}
      </SubmitButton>
    </form>
  );
}
