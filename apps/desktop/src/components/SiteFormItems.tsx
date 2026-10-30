import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { Field } from "./common/field";
import { Input } from "./ui/input";

export const SITE_NAME_MAX = 30;
export const SITE_DESC_MAX = 100;

export const siteFormSchema = z.object({
  name: z
    .string()
    .max(SITE_NAME_MAX, `名称不能超过 ${SITE_NAME_MAX} 个字符`)
    .refine((value) => value.trim().length > 0, "请输入站点名称"),
  description: z
    .string()
    .max(SITE_DESC_MAX, `描述不能超过 ${SITE_DESC_MAX} 个字符`),
});

export type SiteFormValues = z.infer<typeof siteFormSchema>;

/** 站点名称/描述两个字段，欢迎页与新建站点弹窗共用 */
export default function SiteFormItems({
  form,
}: {
  form: UseFormReturn<SiteFormValues>;
}) {
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <div className="flex flex-col gap-4">
      <Field label="站点名称" htmlFor="site-name" error={errors.name?.message}>
        <Input
          id="site-name"
          placeholder="例如：我的博客"
          aria-invalid={Boolean(errors.name)}
          {...register("name")}
        />
      </Field>
      <Field
        label="站点描述（可选）"
        htmlFor="site-description"
        error={errors.description?.message}
      >
        <Input
          id="site-description"
          placeholder="一句话介绍这个站点"
          aria-invalid={Boolean(errors.description)}
          {...register("description")}
        />
      </Field>
    </div>
  );
}
