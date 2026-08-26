import { Route, Switch } from "wouter";
import AppLayout from "./components/AppLayout";
import Lotes from "./pages/Lotes";
import Colaboradores from "./pages/Colaboradores";
import Importar from "./pages/Importar";
import Relatorio from "./pages/Relatorio";

function NaoEncontrado() {
  return (
    <div className="py-16 text-center">
      <p className="text-lg font-semibold">Página não encontrada</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Use o menu à esquerda para navegar.
      </p>
    </div>
  );
}

export default function App() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Lotes} />
        <Route path="/colaboradores" component={Colaboradores} />
        <Route path="/importar" component={Importar} />
        <Route path="/relatorio/:batchId" component={Relatorio} />
        <Route component={NaoEncontrado} />
      </Switch>
    </AppLayout>
  );
}
