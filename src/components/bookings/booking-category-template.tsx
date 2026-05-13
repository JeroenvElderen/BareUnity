import { AppSidebar } from "@/components/sidebar/sidebar";
import layoutStyles from "@/app/page.module.css";
import styles from "./booking-category-template.module.css";
import {
  type BookingRequestType,
  RequestListingButton,
} from "./request-listing-button";

type BookingCategoryTemplateProps = {
  title: string;
  description: string;
  templates: readonly string[];
  requestType?: BookingRequestType;
  requestLabel?: string;
};

export function BookingCategoryTemplate({
  title,
  description,
  templates,
  requestType,
  requestLabel,
}: BookingCategoryTemplateProps) {
  return (
    <main className={layoutStyles.main}>
      <AppSidebar />

      <section className={styles.page}>
        <div className={styles.container}>
          <header className={styles.header}>
            <h1>{title}</h1>
            <p>{description}</p>
            {requestType ? (
              <RequestListingButton
                requestType={requestType}
                label={requestLabel}
              />
            ) : null}
          </header>

          <article className={styles.panel}>
            <p>Template blocks queued for this category:</p>
            <ul className={styles.templateList}>
              {templates.map((template) => (
                <li key={template}>{template}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>
    </main>
  );
}
