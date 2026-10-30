import { Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import HomePage from "./pages/HomePage";
import WelcomePage from "./pages/WelcomePage";

function App() {
  return (
    <>
      <Switch>
        <Route path="/welcome" component={WelcomePage} />
        <Route path="/articles" component={HomePage} />
        <Route path="/editor/:id" component={HomePage} />
        {/* HomePage 是布局壳，兜底匹配 / 及其他路径（内部再分流）。
            注意 wouter/regexparam 的 ":rest*" 不匹配多段路径，兜底必须用无 path 的 Route */}
        <Route component={HomePage} />
      </Switch>
      <Toaster />
    </>
  );
}

export default App;
