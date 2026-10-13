"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  FieldError,
  FormAlert,
  SubmitButton,
} from "@/components/auth/form-parts";
import { CourseThumbnailField } from "@/components/training/course-thumbnail-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { idleFormState } from "@/lib/auth/validation";
import {
  archiveTrainingCourseAction,
  archiveTrainingLessonAction,
  createTrainingCourseAction,
  createTrainingLessonAction,
  createTrainingResourceAction,
  updateTrainingCourseAction,
  updateTrainingLessonAction,
} from "@/lib/training/actions";
import { TrainingFileUploadForm } from "@/components/training/training-file-upload-form";
import type {
  TrainingCourse,
  TrainingLessonDetail,
} from "@/lib/training/queries";
import type { TrainingVisibility } from "@/lib/training/validation";

export function TrainingCourseCreateForm({
  visibility,
}: {
  visibility: TrainingVisibility;
}) {
  const [state, action] = useActionState(
    createTrainingCourseAction,
    idleFormState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <FormAlert state={state} />
      <input type="hidden" name="visibility" value={visibility} />
      <div className="space-y-2">
        <Label htmlFor={`${visibility}-course-name`}>Course name</Label>
        <Input
          id={`${visibility}-course-name`}
          name="name"
          required
          aria-describedby={`${visibility}-course-name-error`}
        />
        <FieldError
          id={`${visibility}-course-name-error`}
          errors={state.fieldErrors?.name}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${visibility}-course-section`}>
            Section (optional)
          </Label>
          <Input
            id={`${visibility}-course-section`}
            name="section"
            placeholder="Product Training"
            aria-describedby={`${visibility}-course-section-help ${visibility}-course-section-error`}
          />
          <p
            id={`${visibility}-course-section-help`}
            className="text-muted-foreground text-xs"
          >
            Groups courses on the catalog (e.g. Live Calls, Scripts).
          </p>
          <FieldError
            id={`${visibility}-course-section-error`}
            errors={state.fieldErrors?.section}
          />
        </div>
        <CourseThumbnailField
          id={`${visibility}-course-thumbnail`}
          errors={state.fieldErrors?.thumbnailUrl}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${visibility}-course-description`}>
          Description (optional)
        </Label>
        <Textarea
          id={`${visibility}-course-description`}
          name="description"
          rows={3}
          aria-describedby={`${visibility}-course-description-error`}
        />
        <FieldError
          id={`${visibility}-course-description-error`}
          errors={state.fieldErrors?.description}
        />
      </div>
      <SubmitButton pendingLabel="Adding..." className="w-auto">
        Add course
      </SubmitButton>
    </form>
  );
}

export function TrainingCourseEditForm({
  course,
}: {
  course: TrainingCourse;
}) {
  const [state, action] = useActionState(
    updateTrainingCourseAction,
    idleFormState,
  );
  const [archiveState, archiveAction] = useActionState(
    archiveTrainingCourseAction,
    idleFormState,
  );

  if (course.archivedAt) {
    return (
      <p className="text-muted-foreground text-sm">
        This course is archived. Historical URLs remain available to permitted
        viewers, but the course is read-only and hidden from the default catalog.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <FormAlert state={state} />
      <FormAlert state={archiveState} />
      <form
        key={`${course.name}|${course.description ?? ""}|${course.section ?? ""}|${course.thumbnailUrl ?? ""}`}
        action={action}
        className="space-y-3"
      >
        <input type="hidden" name="courseId" value={course.id} />
        <div className="space-y-1">
          <Label htmlFor="course-name">Course name</Label>
          <Input
            id="course-name"
            name="name"
            required
            defaultValue={course.name}
            aria-describedby="course-name-error"
          />
          <FieldError
            id="course-name-error"
            errors={state.fieldErrors?.name}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="course-section">Section (optional)</Label>
            <Input
              id="course-section"
              name="section"
              placeholder="Product Training"
              defaultValue={course.section ?? ""}
              aria-describedby="course-section-error"
            />
            <FieldError
              id="course-section-error"
              errors={state.fieldErrors?.section}
            />
          </div>
          <CourseThumbnailField
            id="course-thumbnail"
            defaultValue={course.thumbnailUrl ?? ""}
            errors={state.fieldErrors?.thumbnailUrl}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="course-description">Description</Label>
          <Textarea
            id="course-description"
            name="description"
            rows={2}
            defaultValue={course.description ?? ""}
            aria-describedby="course-description-error"
          />
          <FieldError
            id="course-description-error"
            errors={state.fieldErrors?.description}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton pendingLabel="Saving..." className="w-auto">
            Save changes
          </SubmitButton>
          <SubmitButton
            pendingLabel="Archiving..."
            variant="outline"
            className="w-auto"
            formAction={archiveAction}
          >
            Archive course
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}

export function TrainingLessonCreateForm({ courseId }: { courseId: string }) {
  const [state, action] = useActionState(
    createTrainingLessonAction,
    idleFormState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="min-w-0 space-y-2">
      <FormAlert state={state} />
      <input type="hidden" name="courseId" value={courseId} />
      <div className="flex min-w-0 flex-nowrap items-end gap-2 overflow-x-auto">
        <div className="w-40 shrink-0 space-y-1 sm:w-48">
          <Label htmlFor="lesson-title" className="text-xs">
            Lesson title
          </Label>
          <Input
            id="lesson-title"
            name="title"
            required
            aria-describedby="lesson-title-error"
          />
          <FieldError
            id="lesson-title-error"
            errors={state.fieldErrors?.title}
          />
        </div>
        <div className="min-w-[16rem] flex-[2] space-y-1">
          <Label htmlFor="vimeo-url" className="text-xs">
            Vimeo URL
          </Label>
          <Input
            id="vimeo-url"
            name="vimeoUrl"
            type="url"
            required
            placeholder="https://vimeo.com/123456789"
            aria-describedby="vimeo-url-help vimeo-url-error"
          />
          <FieldError
            id="vimeo-url-error"
            errors={state.fieldErrors?.vimeoVideoId}
          />
        </div>
        <div className="w-16 shrink-0 space-y-1">
          <Label htmlFor="lesson-sort-order" className="text-xs">
            Order
          </Label>
          <Input
            id="lesson-sort-order"
            name="sortOrder"
            type="number"
            min={0}
            max={100000}
            defaultValue={0}
            aria-describedby="lesson-sort-order-error"
          />
          <FieldError
            id="lesson-sort-order-error"
            errors={state.fieldErrors?.sortOrder}
          />
        </div>
        <SubmitButton pendingLabel="Adding..." className="w-auto shrink-0">
          Add lesson
        </SubmitButton>
      </div>
      <p id="vimeo-url-help" className="text-muted-foreground text-xs">
        Vimeo only (not YouTube). After save, open the lesson to attach a
        script/PDF download link.
      </p>
    </form>
  );
}

function lessonEditFormKey(lesson: TrainingLessonDetail): string {
  return `${lesson.title}|${lesson.vimeoVideoId}|${lesson.sortOrder}`;
}

export function TrainingLessonEditForm({
  lesson,
  compact = false,
}: {
  lesson: TrainingLessonDetail;
  /** Puts Save / Archive on the main lesson header instead of a bottom card. */
  compact?: boolean;
}) {
  const [state, action] = useActionState(
    updateTrainingLessonAction,
    idleFormState,
  );
  const [archiveState, archiveAction] = useActionState(
    archiveTrainingLessonAction,
    idleFormState,
  );

  if (lesson.archivedAt || lesson.course.archivedAt) {
    return (
      <p className="text-muted-foreground text-sm">
        This historical lesson is read-only because the lesson or its course is
        archived.
      </p>
    );
  }

  const formKey = lessonEditFormKey(lesson);

  if (compact) {
    return (
      <div className="min-w-0 space-y-2">
        {/* Alerts stay outside the keyed form so remount after save keeps the message. */}
        <FormAlert state={state} />
        <FormAlert state={archiveState} />
        <div className="flex min-w-0 flex-nowrap items-end gap-2 overflow-x-auto">
          <form
            key={formKey}
            action={action}
            className="flex min-w-0 flex-1 flex-nowrap items-end gap-2"
          >
            <input type="hidden" name="lessonId" value={lesson.id} />
            <div className="w-40 shrink-0 space-y-1 sm:w-48">
              <Label htmlFor="edit-lesson-title" className="text-xs">
                Title
              </Label>
              <Input
                id="edit-lesson-title"
                name="title"
                required
                defaultValue={lesson.title}
                aria-describedby="edit-lesson-title-error"
              />
              <FieldError
                id="edit-lesson-title-error"
                errors={state.fieldErrors?.title}
              />
            </div>
            <div className="min-w-[16rem] flex-[2] space-y-1">
              <Label htmlFor="edit-vimeo-url" className="text-xs">
                Vimeo URL
              </Label>
              <Input
                id="edit-vimeo-url"
                name="vimeoUrl"
                type="url"
                required
                defaultValue={`https://vimeo.com/${lesson.vimeoVideoId}`}
                aria-describedby="edit-vimeo-url-error"
              />
              <FieldError
                id="edit-vimeo-url-error"
                errors={state.fieldErrors?.vimeoVideoId}
              />
            </div>
            <div className="w-16 shrink-0 space-y-1">
              <Label htmlFor="edit-lesson-sort-order" className="text-xs">
                Order
              </Label>
              <Input
                id="edit-lesson-sort-order"
                name="sortOrder"
                type="number"
                min={0}
                max={100000}
                defaultValue={String(lesson.sortOrder)}
                aria-describedby="edit-lesson-sort-order-error"
              />
              <FieldError
                id="edit-lesson-sort-order-error"
                errors={state.fieldErrors?.sortOrder}
              />
            </div>
            <SubmitButton pendingLabel="Saving..." className="w-auto shrink-0">
              Save lesson
            </SubmitButton>
          </form>
          <form action={archiveAction} className="shrink-0">
            <input type="hidden" name="lessonId" value={lesson.id} />
            <SubmitButton
              pendingLabel="Archiving..."
              variant="outline"
              className="w-auto"
            >
              Archive lesson
            </SubmitButton>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <FormAlert state={state} />
      <form key={formKey} action={action} className="space-y-4">
        <input type="hidden" name="lessonId" value={lesson.id} />
        <div className="space-y-2">
          <Label htmlFor="edit-lesson-title">Lesson title</Label>
          <Input
            id="edit-lesson-title"
            name="title"
            required
            defaultValue={lesson.title}
            aria-describedby="edit-lesson-title-error"
          />
          <FieldError
            id="edit-lesson-title-error"
            errors={state.fieldErrors?.title}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-vimeo-url">Vimeo URL</Label>
          <Input
            id="edit-vimeo-url"
            name="vimeoUrl"
            type="url"
            required
            defaultValue={`https://vimeo.com/${lesson.vimeoVideoId}`}
            aria-describedby="edit-vimeo-url-error"
          />
          <FieldError
            id="edit-vimeo-url-error"
            errors={state.fieldErrors?.vimeoVideoId}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-lesson-sort-order">Sort order</Label>
          <Input
            id="edit-lesson-sort-order"
            name="sortOrder"
            type="number"
            min={0}
            max={100000}
            defaultValue={String(lesson.sortOrder)}
            aria-describedby="edit-lesson-sort-order-error"
          />
          <FieldError
            id="edit-lesson-sort-order-error"
            errors={state.fieldErrors?.sortOrder}
          />
        </div>
        <SubmitButton pendingLabel="Saving..." className="w-auto">
          Save lesson
        </SubmitButton>
      </form>
      <form action={archiveAction} className="space-y-2">
        <FormAlert state={archiveState} />
        <input type="hidden" name="lessonId" value={lesson.id} />
        <SubmitButton
          pendingLabel="Archiving..."
          variant="outline"
          className="w-auto"
        >
          Archive lesson
        </SubmitButton>
      </form>
    </div>
  );
}

export function TrainingResourceCreateForm({
  lessonId,
  compact = false,
}: {
  lessonId: string;
  /** Two-line strip under the video instead of a tall stacked form. */
  compact?: boolean;
}) {
  const [linkState, linkAction] = useActionState(
    createTrainingResourceAction,
    idleFormState,
  );
  const linkFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (linkState.status === "success") linkFormRef.current?.reset();
  }, [linkState]);

  return (
    <div className={compact ? "border-border space-y-3 border-t pt-2" : "space-y-6"}>
      <TrainingFileUploadForm lessonId={lessonId} />

      <form
        ref={linkFormRef}
        action={linkAction}
        className="flex flex-wrap items-end gap-2"
      >
        <FormAlert state={linkState} />
        <input type="hidden" name="lessonId" value={lessonId} />
        <input type="hidden" name="sortOrder" value="0" />
        <div className="min-w-[8rem] flex-1 space-y-1">
          <Label htmlFor="resource-title" className="text-xs">
            Or link title
          </Label>
          <Input
            id="resource-title"
            name="title"
            required
            placeholder="External script"
            aria-describedby="resource-title-error"
          />
          <FieldError
            id="resource-title-error"
            errors={linkState.fieldErrors?.title}
          />
        </div>
        <div className="min-w-[12rem] flex-[1.5] space-y-1">
          <Label htmlFor="resource-url" className="text-xs">
            HTTPS link (optional path)
          </Label>
          <Input
            id="resource-url"
            name="url"
            type="url"
            required
            placeholder="https://drive.google.com/..."
            aria-describedby="resource-url-error"
          />
          <FieldError
            id="resource-url-error"
            errors={linkState.fieldErrors?.url}
          />
        </div>
        <SubmitButton pendingLabel="Adding..." className="w-auto" variant="outline">
          Add link
        </SubmitButton>
      </form>
    </div>
  );
}
