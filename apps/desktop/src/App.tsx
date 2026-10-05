import { App as AntdApp, ConfigProvider } from "antd";
import { Route, Switch } from "wouter";
import HomePage from "./pages/HomePage";
import WelcomePage from "./pages/WelcomePage";

function App() {
  return (
    <ConfigProvider
      theme={{
        // cssVar.key 必须与 main.tsx 中挂到 <html> 的类名一致，
        // antd 的 --ant-* 全局变量才挂载生效
        cssVar: { key: "css-var-my-theme-id" },
        // 取值与 design/styles.css 中的 token 一致
        token: {
          colorPrimary: "#3563D9",
          colorBgLayout: "#F4F5F7",
        },
        components: {
          Layout: {
            siderBg: "#FBFBFC",
          },
          Menu: {
            itemBg: "transparent",
            // vertical/inline 菜单根元素右侧的默认边线（activeBarBorderWidth 的唯一用途）
            activeBarBorderWidth: 0,
            // lucide 图标为 16px；antd 按 iconSize 计算 label 可用宽度，需对齐
            // （否则带 extra 的条目会溢出 2px，行尾被裁成省略号）
            iconSize: 16,
          },
        },
      }}
    >
      {/* component={false}：只做 message 等 API 的 Provider，不渲染包裹 div，
          否则 .ant-app 默认无高度会断掉 #root → Layout 的 100% 高度链 */}
      <AntdApp component={false}>
        <Switch>
          <Route path="/welcome" component={WelcomePage} />
          <Route path="/articles" component={HomePage} />
          <Route path="/editor/:id" component={HomePage} />
          {/* HomePage 是布局壳，兜底匹配 / 及其他路径（内部再分流）。
              注意 wouter/regexparam 的 ":rest*" 不匹配多段路径，兜底必须用无 path 的 Route */}
          <Route component={HomePage} />
        </Switch>
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;
