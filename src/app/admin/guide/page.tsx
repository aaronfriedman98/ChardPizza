import Link from "next/link";

export const metadata = { title: "How-to guide | Char'd Pizza" };

// Plain-language manual for running a sale night. Kept in code so it never drifts from the buttons it describes.
const SECTIONS = [
  { id: "night", title: "The night in one minute" },
  { id: "before", title: "Before the night" },
  { id: "board", title: "Service Board, piece by piece" },
  { id: "card", title: "Every button on an order card" },
  { id: "message", title: "The Message button" },
  { id: "kitchen", title: "Kitchen screen" },
  { id: "handoff", title: "Handoff and Delivery screens" },
  { id: "situations", title: "When something comes up" },
  { id: "after", title: "After the night" },
];

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="page-title">How-to guide</h1>
        <p className="mt-1 text-ink/60">Everything the admin can do on a sale night, in plain words. Bookmark this on your phone.</p>
      </div>

      <nav className="card">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/50">Jump to</div>
        <ol className="mt-2 grid gap-1 sm:grid-cols-2">
          {SECTIONS.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-ember hover:underline">
                {i + 1}. {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <Section id="night" title="1. The night in one minute">
        <p>
          Every order moves through the same four stops. You never type a status, you tap one big button and the order moves to the next stop on every screen and every phone at once.
        </p>
        <Flow steps={["Scheduled", "Ready", "Picked up / Delivered"]} />
        <ul>
          <li>
            <b>Scheduled</b>: the order is in, the customer picked a time. The oven list tells you when to make it.
          </li>
          <li>
            <b>Ready</b>: the pies are boxed with that customer&rsquo;s name on the box. Tap <Key>Ready</Key> the moment the box closes.
          </li>
          <li>
            <b>Picked up</b> (or <b>Out for delivery</b> then <b>Delivered</b>): the box left your hands. Tap <Key>Picked up</Key> when you give it over.
          </li>
        </ul>
        <p>
          Three screens show the same orders, cut for three jobs. <b>Service Board</b> is the overview and has every control. <b>Kitchen</b> is the oven&rsquo;s to-do list. <b>Handoff</b> is the door: who is here, what is theirs, are they paid.
          A good setup is one phone on Kitchen by the oven, one on Handoff at the door, and the Board open on whatever is left.
        </p>
      </Section>

      <Section id="before" title="2. Before the night">
        <ol>
          <li>
            <b>Publish the sale</b> under <Link href="/admin/services">Services</Link>. Until it is published the website shows &ldquo;Nothing cooking&rdquo; and no order can come in.
          </li>
          <li>
            <b>Share it</b>: open the sale, then Share. Copy the WhatsApp message (it lists the menu and open times live) and download the flyer.
          </li>
          <li>
            <b>Place one test order</b> from your own phone to see the whole path, then cancel it from the Board.
          </li>
          <li>
            <b>Check Settings</b> once: pickup address, Zelle instructions, and the &ldquo;late&rdquo; thresholds that turn cards amber and red.
          </li>
          <li>
            <b>Record what you bought</b> under <Link href="/admin/expenses">Expenses</Link> and tag each receipt to the sale, so the night&rsquo;s report shows real profit.
          </li>
        </ol>
      </Section>

      <Section id="board" title="3. Service Board, piece by piece">
        <h3>Top row</h3>
        <ul>
          <li>
            <b>Sale name and hours</b>, plus links to the sale&rsquo;s settings and <Key>+ manual order</Key> for anyone who orders by phone, WhatsApp, or walks up.
          </li>
          <li>
            <b>Live dot</b> next to the name: green means this screen updates itself the second an order changes anywhere. No need to refresh.
          </li>
          <li>
            <Key tone="amber">⏸ PAUSE NEW ORDERS</Key>: the website stops taking orders and says &ldquo;paused, check back in a few minutes&rdquo;. Nothing already ordered is touched. Tap again to <Key tone="green">▶ RESUME</Key>. Use it when the oven is behind.
          </li>
        </ul>
        <h3>The six tiles</h3>
        <ul>
          <li>
            <b>Dough used</b>: pies sold plus pies lost, out of the dough you said you have. &ldquo;Left&rdquo; is how many more pies you can sell.
          </li>
          <li>
            <b>Orders</b>: live orders, split pickup and delivery.
          </li>
          <li>
            <b>Revenue</b>: what all live orders add up to, and how much of it is already paid.
          </li>
          <li>
            <b>Outstanding</b>: money you still have to collect at the door (cash and unseen Zelles).
          </li>
          <li>
            <b>Next up</b>: the next order the oven should finish.
          </li>
          <li>
            <b>Health</b>: On schedule, Slightly behind, or Kitchen backed up, based on how late orders are running. When it turns red it suggests pausing.
          </li>
        </ul>
        <h3>Filters and views</h3>
        <ul>
          <li>
            <b>Search</b> by name, phone, or order number. Fastest way to find someone standing in front of you.
          </li>
          <li>
            <b>Chips</b>: <i>Active</i> hides done and cancelled orders (the normal view). <i>Late</i> shows only amber and red cards. <i>Ready</i> shows boxed orders waiting. <i>Unpaid</i> is your collection list. <i>Done</i> is the history.
          </li>
          <li>
            <b>By time</b> groups cards by the slot the customer chose. <b>Queue order</b> is the order the kitchen will make them, rush and &ldquo;here&rdquo; first. <b>By status</b> stacks Scheduled, Ready, and so on.
          </li>
        </ul>
        <h3>Oven list (dark panel)</h3>
        <p>
          The exact sequence to bake, pie by pie, with the customer names under each run. Same pie types are batched together when that delays nobody. The highlighted row is what goes in the oven next. It is the same list the Kitchen screen shows.
        </p>
        <h3>Reading a card</h3>
        <ul>
          <li>
            <b>Big time</b> is the customer&rsquo;s slot. Name opens the full order page (edit items, notes, special pricing, resend confirmation).
          </li>
          <li>
            <b>Badges</b>: Pickup or Delivery with zone, payment (<Tag tone="green">PAID</Tag> or <Tag tone="amber">CASH DUE</Tag> / <Tag tone="amber">AWAITING ZELLE</Tag>), and the status. Extra badges: <Tag tone="red">MAKE NOW</Tag>, <Tag tone="gray">ON HOLD</Tag>, <Tag tone="blue">HERE</Tag>.
          </li>
          <li>
            <b>Timers</b>: &ldquo;8 MIN BEHIND&rdquo; means the slot time passed and the box is not closed yet. &ldquo;READY 12 MIN&rdquo; means the box has been sitting that long.
          </li>
          <li>
            <b>Border colour</b>: amber ring = a little late, red ring = very late or sitting too long, green = ready and waiting, orange = being made.
          </li>
          <li>
            <b>Yellow note</b> under the items is the customer&rsquo;s special request. Read it before you make the pie.
          </li>
        </ul>
      </Section>

      <Section id="card" title="4. Every button on an order card">
        <Table
          rows={[
            ["Ready", "The pies are boxed. Order turns green, moves to the top of Handoff, and the Kitchen stops showing it. Does not message the customer."],
            ["Picked up", "The customer has the box. Order is done. If it is not marked paid yet you get a quick choice: Mark paid & hand off, or Hand off anyway."],
            ["Out for delivery", "Delivery orders only. The driver has it. Then Delivered when it arrives."],
            ["Mark paid", "They paid you cash, or you saw the Zelle land. Records the payment. Card orders are already PAID when they arrive."],
            ["Undo paid", "You hit Mark paid by mistake. Writes a refund line so the money math still adds up."],
            ["📩 Text confirmation", "Appears only when the customer got no confirmation email (no address, or it bounced). Opens your texting app with the order summary filled in. Tap send, and the card shows “Confirmation texted”."],
            ["💲 Text new total", "Appears after you put Family & friends (or a custom price) on an order the customer placed themselves. Texts them the discounted total and how to pay, since their confirmation showed full price. Never shows on orders you entered by hand."],
            ["💬 Message", "Opens WhatsApp to that customer with a ready-made text. See the next section."],
            ["Here", "The customer showed up early. Puts a HERE badge on the card and pulls them up the oven queue."],
            ["Make now", "Jump this order to the front of the oven list. Use for someone waiting, or a mistake you need to redo."],
            ["Hold / Release", "Park an order. It leaves the oven list until you release it. Use when someone says they are running 30 minutes late."],
            ["▲ ▼", "Nudge an order up or down the oven queue by one spot."],
            ["Not ready", "You tapped Ready too soon. Puts it back to Scheduled."],
            ["Cancel", "Asks for a reason, frees the time slot and the dough, and shows the customer a cancelled page. Cannot be undone, so if they come back after all, place a manual order."],
            ["Undo pickup", "On a done order. Puts it back to Ready."],
          ]}
        />
      </Section>

      <Section id="message" title="5. The Message button">
        <p>
          <Key tone="green">💬 Message</Key> never changes the order and never sends anything by itself. It opens WhatsApp (or a text) to that customer with the words already typed, you read them and press send. Each tap is logged on the order so you can see what was sent.
        </p>
        <ul>
          <li>
            <b>Ready in ~5 minutes</b>: &ldquo;heading into the oven, come over.&rdquo; Send this when their run is next on the oven list.
          </li>
          <li>
            <b>Ready now</b>: &ldquo;your pizza is boxed and waiting.&rdquo; Send this right after you tap <Key>Ready</Key>, or when a box has been sitting a while.
          </li>
          <li>
            <b>Running behind</b>: asks you roughly how many minutes, then tells them a new time. Send before they arrive, not after.
          </li>
          <li>
            <b>Delivery arriving</b> (delivery orders only).
          </li>
          <li>
            <b>Payment reminder</b>: for Zelle orders you have not seen come through.
          </li>
          <li>
            <b>Custom message</b>: type your own.
          </li>
        </ul>
        <p>Choose <b>WhatsApp</b> or <b>Text (SMS)</b> at the top of the menu. WhatsApp is the default.</p>
      </Section>

      <Section id="kitchen" title="6. Kitchen screen">
        <p>
          Built for the person at the oven. It shows demand, not paperwork: the oven list on top says which pies to make in which order, and the <b>Box it</b> cards below show each order&rsquo;s pies in huge type with the customer&rsquo;s first name. When a box closes, tap the big green <Key tone="green">Ready</Key> on that card.
        </p>
        <ul>
          <li>Cards are numbered in make order. Red border = Make now. Blue = the customer is here. Amber = late.</li>
          <li>
            <b>On hold</b> orders sit in a faded list at the bottom and are not on the oven list.
          </li>
          <li>
            <Key tone="red">Lost a pie</Key>: burnt it, dropped it, ate it, gave it away. Pick the pie and reason. It counts against your dough so the website stops selling pies you no longer have, and it shows in the report.
          </li>
        </ul>
      </Section>

      <Section id="handoff" title="7. Handoff and Delivery screens">
        <p>
          <b>Handoff</b> is the door. Pickup orders only, in three folds: <b>Ready to hand out</b>, <b>Coming up</b>, and <b>Picked up</b>. Someone says their name, you type two letters in the search, see PAID or CASH DUE, tap <Key>Picked up</Key>. Phone numbers are tap-to-call.
        </p>
        <p>
          <b>Delivery</b> is the same idea for the driver: <b>Out for delivery</b>, <b>Ready to go</b>, <b>Coming up</b>, <b>Delivered</b>, with the address and notes on each card.
        </p>
      </Section>

      <Section id="situations" title="8. When something comes up">
        <Table
          rows={[
            ["Someone is early", "Tap Here. They move up the queue and the kitchen sees a HERE badge."],
            ["Someone is late or not answering", "Leave the order Ready. After 15 minutes the card turns amber and an “Orders sitting ready” button appears. Send Ready now from Message. If they never show, Cancel at the end of the night and log the pie under Lost a pie as Gave it away if you handed it to someone else."],
            ["Customer wants to cancel", "Cancel on their card with a reason. For a card payment, refund in the Stripe dashboard, then the Board shows it unpaid."],
            ["Walk-up, family, or a special request", "+ manual order at the top of the Board. Same menu and times. Flip the Override capacity switch if the slot is full or you are past the dough count."],
            ["Oven is behind", "Tap PAUSE NEW ORDERS so no more come in. Send Running behind to the next few customers. Resume when caught up."],
            ["Ahead of schedule", "Make the next order on the oven list early, then Message them Ready in ~5 minutes. Or Make now on whichever order you want to pull forward."],
            ["Paid cash", "Mark paid on the card, or do it in one tap with Mark paid & hand off when you give the box."],
            ["Zelle came through", "Mark paid once you see it in your Zelle app. Payment reminder is in Message if it has not."],
            ["Paid by card", "Already PAID when the order appears. Nothing to do."],
            ["Tapped the wrong button", "Not ready, Undo pickup, and Undo paid each reverse one tap. Cancel is the one that sticks."],
            ["Wrong items or wrong time", "Open the order (tap the name) and use Edit order."],
            ["Ordering should close early", "PAUSE NEW ORDERS, or in the sale’s settings set the override to Closed."],
          ]}
        />
        <p>Ordering closes on its own at the sale&rsquo;s end time (or the close time you set), so you do not have to remember.</p>
      </Section>

      <Section id="after" title="9. After the night">
        <ul>
          <li>
            Mark the last orders Picked up and <b>Cancel</b> any no-shows so the counts are honest.
          </li>
          <li>
            <Link href="/admin/reports">Reports</Link> shows pies sold, revenue by payment type, lost pies, and expenses tagged to the sale.
          </li>
          <li>
            <Link href="/admin/expenses">Expenses</Link>: add anything you forgot. Each one can be tagged to a sale and marked reimbursable so partners get paid back.
          </li>
          <li>
            <Link href="/admin/account">Account</Link> is the business ledger: cash and Zelle in, Stripe payouts when they land, reimbursements out.
          </li>
          <li>Card money arrives in the bank from Stripe a few days later, minus Stripe&rsquo;s fee. The customer paid that fee as the 4% line.</li>
        </ul>
      </Section>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card guide scroll-mt-20 space-y-3">
      <h2 className="text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Flow({ steps }: { steps: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      {steps.map((s, i) => (
        <span key={s} className="flex items-center gap-2">
          <span className="rounded-full border border-ember/40 bg-ember/10 px-3 py-1 text-sm font-semibold text-ember">{s}</span>
          {i < steps.length - 1 && <span className="text-ink/40">→</span>}
        </span>
      ))}
    </div>
  );
}

function Key({ children, tone }: { children: React.ReactNode; tone?: "amber" | "green" | "red" }) {
  const cls = tone === "amber" ? "bg-amber-500 text-white" : tone === "green" ? "bg-green-600 text-white" : tone === "red" ? "bg-red-50 text-red-700 border border-red-300" : "bg-ember text-white";
  return <span className={`inline-block rounded-md px-1.5 py-0.5 text-[12px] font-semibold leading-tight ${cls}`}>{children}</span>;
}

function Tag({ children, tone }: { children: React.ReactNode; tone: "gray" | "green" | "amber" | "red" | "blue" }) {
  const cls = { gray: "bg-ink/10 text-ink/70", green: "bg-green-100 text-green-800", amber: "bg-amber-100 text-amber-900", red: "bg-red-100 text-red-800", blue: "bg-blue-100 text-blue-800" }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>{children}</span>;
}

function Table({ rows }: { rows: [string, string][] }) {
  return (
    <div className="-mx-2 overflow-hidden rounded-xl border border-line">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([k, v], i) => (
            <tr key={k} className={i % 2 ? "bg-cream/60" : "bg-white"}>
              <th className="w-[34%] px-3 py-2 text-left align-top font-semibold">{k}</th>
              <td className="px-3 py-2 align-top text-ink/80">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
