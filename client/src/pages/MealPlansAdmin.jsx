import { AdminPage } from "../components/admin/AdminUI";
import MealPlansPanel from "../components/admin/MealPlansPanel";

// A top-level page now, not a tab buried inside Menu — plans/pricing config
// plus subscriber management had genuinely outgrown "a menu setting", and
// staff need to reach the Subscribers list (they can already view/pause/
// cancel via the API) which they couldn't when this lived under the
// owner-only /menu-admin route. MealPlansPanel itself gates the owner-only
// pieces (plan creation, discount tiers, delivery fee) internally.
export default function MealPlansAdmin() {
  return (
    <AdminPage eyebrow="Plans, pricing, and who's subscribed" title="Meal Plans">
      <MealPlansPanel />
    </AdminPage>
  );
}
