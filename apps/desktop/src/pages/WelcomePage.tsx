import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { InlineAlert } from "../components/common/inline-alert";
import SiteFormItems, {
  siteFormSchema,
  type SiteFormValues,
} from "../components/SiteFormItems";
import { createSite, listSites, setActiveSite } from "../lib/site";

export default function WelcomePage() {
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<SiteFormValues>({
    resolver: zodResolver(siteFormSchema),
    defaultValues: { name: "", description: "" },
  });
  const { isSubmitting } = form.formState;

  // 已有站点时回到主页（处理直接访问 /welcome 的情况）
  useEffect(() => {
    listSites()
      .then((sites) => {
        if (sites.length > 0) {
          navigate("/", { replace: true });
        }
      })
      .catch(() => {
        // 后端异常时留在欢迎页，创建时会把具体错误展示出来
      });
  }, [navigate]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const site = await createSite(
        values.name.trim(),
        values.description.trim() || null,
      );
      // 首个站点即当前站点；失败不阻塞跳转，HomePage 有兜底逻辑
      await setActiveSite(site.id).catch(() => {});
      navigate("/", { replace: true });
    } catch (e) {
      setError(String(e));
    }
  });

  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="w-[400px]">
        <div className="text-[28px] font-bold text-foreground">Wordma</div>
        <div className="mt-2 mb-7 text-sm text-muted-foreground">
          创建你的第一个站点空间，开始写作。
        </div>
        {error ? <InlineAlert className="mb-4">{error}</InlineAlert> : null}
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <SiteFormItems form={form} />
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Spinner className="size-4" /> : null}
            创建站点
          </Button>
        </form>
      </div>
    </div>
  );
}
