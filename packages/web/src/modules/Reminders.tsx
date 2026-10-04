import { CollectionScreen } from '../ui/CollectionScreen.js';

/**
 * A reminder you write yourself — a title, an optional message, and a time.
 * The server's reminder sweep (the same one that delivers task and event
 * reminders) picks it up once it comes due and delivers it exactly as
 * written, through whichever channels Settings → Notifications has on for
 * "Reminders".
 */
export default function Reminders(): JSX.Element {
  return (
    <CollectionScreen
      collection="reminders"
      description="Something to be notified about at a time you choose."
      emptyTitle="No reminders yet"
      emptyBody="Add one with a title and a time — a message is optional."
    />
  );
}
