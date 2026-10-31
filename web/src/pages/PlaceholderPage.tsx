import { PageTitle } from '../components/PageTitle';

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <section className="p-6">
      <PageTitle>
        <h1 className="text-2xl font-bold">{title}</h1>
      </PageTitle>
      <p className="mt-2 text-muted">Uskoro.</p>
    </section>
  );
}
