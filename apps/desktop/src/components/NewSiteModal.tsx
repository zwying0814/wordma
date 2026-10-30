import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { InlineAlert } from "./common/inline-alert";
import SiteFormItems, {
  siteFormSchema,
  type SiteFormValues,
} from "./SiteFormItems";
import { createSite, setActiveSite, type Site } from "../lib/site";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (site: Site) => void;
}

const EMPTY_VALUES: SiteFormValues = { name: "", description: "" };

export default function NewSiteModal({ open, onClose, onCreated }: Props) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<SiteFormValues>({
    resolver: zodResolver(siteFormSchema),
    defaultValues: EMPTY_VALUES,
  });
  const { isSubmitting } = form.formState;

  // 每次打开时重置表单
  useEffect(() => {
    if (open) {
      form.reset(EMPTY_VALUES);
      setError(null);
    }
  }, [open, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const site = await createSite(
        values.name.trim(),
        values.description.trim() || null,
      );
      // 新站点设为当前站点；失败不阻塞创建结果
      await setActiveSite(site.id).catch(() => {});
      onCreated(site);
      onClose();
    } catch (e) {
      setError(String(e));
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isSubmitting) onClose();
      }}
    >
      <DialogContent showCloseButton={!isSubmitting} className="sm:max-w-md">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>新建站点</DialogTitle>
            <DialogDescription>每个站点是一份独立的内容空间。</DialogDescription>
          </DialogHeader>
          {error ? <InlineAlert>{error}</InlineAlert> : null}
          <SiteFormItems form={form} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={onClose}
            >
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Spinner className="size-4" /> : null}
              创建
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
