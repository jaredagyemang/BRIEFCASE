import Link from "next/link";
import { ContactActions } from "@/components/contact-actions";
import { DetailList } from "@/components/detail-list";
import { getCoach } from "./data";

export default async function CoachPage({ params }: PageProps<"/coaches/[id]">) {
  const { id } = await params;
  const coach = await getCoach(id);

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link href="/coaches" className="text-accent">
          ‹ Coaches
        </Link>
        <Link
          href={`/coaches/${coach.id}/edit`}
          className="rounded-full bg-surface-muted px-4 py-1.5 text-sm font-semibold"
        >
          Edit
        </Link>
      </div>

      <div className="mt-6 flex flex-col items-center text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface text-2xl font-semibold">
          {coach.first_name[0]}
          {coach.last_name[0]}
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">
          {coach.first_name} {coach.last_name}
        </h1>
        {coach.title && <p className="mt-0.5 text-muted">{coach.title}</p>}
      </div>

      <ContactActions phone={coach.cell_phone} email={coach.email} officePhone={coach.office_phone} />

      <DetailList
        items={[
          { label: "Title", value: coach.title },
          { label: "Email", value: coach.email },
          { label: "Cell phone", value: coach.cell_phone },
          { label: "Office phone", value: coach.office_phone },
        ]}
      />

      <section className="mt-6">
        <h2 className="mb-2 px-1 text-sm font-semibold tracking-wide text-muted uppercase">Notes</h2>
        <div className="rounded-3xl bg-surface px-4 py-3.5">
          {coach.notes ? (
            <p className="break-words whitespace-pre-wrap">{coach.notes}</p>
          ) : (
            <p className="text-muted">No notes yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
