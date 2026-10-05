import { Empty } from "antd";
import * as stylex from "@stylexjs/stylex";
import x from "@stylexjs/atoms";
import { useSite } from "../context/SiteContext";

export default function DashboardPage() {
  const { activeSite } = useSite();
  return (
    <div
      {...stylex.props(
        x.display.flex,
        x.alignItems.center,
        x.justifyContent.center,
        x.height["100%"],
        x.overflowY.auto,
      )}
    >
      <Empty description={`「${activeSite.name}」的仪表盘建设中，先去写文章吧`} />
    </div>
  );
}
