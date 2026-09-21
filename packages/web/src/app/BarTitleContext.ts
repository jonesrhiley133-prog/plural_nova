import { createContext } from 'react';

/**
 * What the app bar above the page is already showing, so `PageHeader` can
 * avoid printing the same word again underneath it.
 *
 * A context rather than `useLocation()` inside `PageHeader` itself, on
 * purpose: `Layout` already computes this from the route once, and a second
 * lookup would need every place that renders a page — including an isolated
 * component test with no `<Router>` around it — to carry Router context just
 * to answer a question about heading text. The default of `null` means "no
 * bar title known", which always shows the heading — the same thing rendering
 * `PageHeader` outside `Layout` did before this existed.
 */
export const BarTitleContext = createContext<string | null>(null);
