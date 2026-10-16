import type { ActionState } from "./action-state";
import { ActionForm } from "./action-form.client";
import { inputClassName } from "./action-styles";
import { SubmitButton } from "./submit-button.client";

// The City control (TechDesign/project-dashboard.md, "Switching cities", R11): a labelled select and a
// button over a Server Function, so it works without client script. With no current city (`currentId` null)
// it starts on a placeholder, and the person must pick (R13). In the navigation rail it sits on the dark
// background (`onDark`); in the "choose a city" panel it sits on a surface.
export function CitySwitcher({
  cities,
  currentId,
  action,
  onDark = false,
}: {
  cities: { id: string; name: string; stateCode: string }[];
  currentId: string | null;
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  onDark?: boolean;
}) {
  return (
    <ActionForm action={action} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        <span className={onDark ? "text-xs text-nav-muted" : "text-text"}>City</span>
        <select name="jurisdictionId" required defaultValue={currentId ?? ""} className={inputClassName}>
          {currentId === null ? (
            <option value="" disabled>
              Choose a city
            </option>
          ) : null}
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}, {c.stateCode}
            </option>
          ))}
        </select>
      </label>
      <SubmitButton variant="secondary" pendingLabel="Switching…">
        {currentId === null ? "Use this city" : "Switch city"}
      </SubmitButton>
    </ActionForm>
  );
}
