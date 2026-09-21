import { useContext, type ReactNode } from 'react';
import { BarTitleContext } from './BarTitleContext.js';

/**
 * The heading block every screen opens with: what this is, and what to do here.
 *
 * On most screens the title is the same word the bar at the top of the app is
 * already showing, so printing it again gave every page two identical
 * headings and pushed the actual content down the screen. When they match, the
 * heading stays in the document for anything navigating by structure and stops
 * taking up room on the page. Where it differs — the dashboard greets you by
 * name — it is shown, because then it is saying something new.
 */
export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
}): JSX.Element {
  const barTitle = useContext(BarTitleContext);
  const echoesTheBar = barTitle !== null && barTitle.toLowerCase() === title.toLowerCase();

  const empty = echoesTheBar && !description && !children;

  return (
    <header className={empty ? 'page-header page-header--bare' : 'page-header'}>
      <div className="page-header__text">
        <h1 className={echoesTheBar ? 'visually-hidden' : 'page-header__title'}>{title}</h1>
        {description ? <p className="page-header__description">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}
