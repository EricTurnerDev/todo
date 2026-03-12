(ns todo.views
  "Hiccup HTML templates."
  (:require [hiccup.page :refer [html5 include-css include-js]]))

(defn- recurrence-select [id-prefix]
  ;; Wrap in a single :div so Hiccup always receives one element — returning
  ;; (list ...) from a function causes Hiccup 1.x to fall back to str, which
  ;; prints the list representation rather than rendering the HTML.
  [:div
   [:div.form-group
    [:label {:for (str id-prefix "recurrence")}
     "Repeats " [:span.optional "(optional)"]]
    [:select {:id (str id-prefix "recurrence")}
     [:option {:value ""}        "Does not repeat"]
     [:option {:value "daily"}   "Daily"]
     [:option {:value "weekly"}  "Weekly"]
     [:option {:value "monthly"} "Monthly"]
     [:option {:value "yearly"}  "Yearly"]
     [:option {:value "custom"}  "Every N days"]]]
   [:div.form-group {:id (str id-prefix "recurrence-days-group") :style "display:none"}
    [:label {:for (str id-prefix "recurrence-days")} "Repeat every"]
    [:div.inline-group
     [:input {:id (str id-prefix "recurrence-days") :type "number" :min "1" :placeholder "7"}]
     [:span.input-suffix "days"]]]])

(defn- category-select
  "A <select> whose options are populated by app.js after categories load."
  [id]
  [:div.form-group
   [:label {:for id} "Category " [:span.optional "(optional)"]]
   ;; The placeholder option is always present; JS appends the real options.
   [:select {:id id}
    [:option {:value ""} "No category"]]])

(defn index-page []
  (html5 {:lang "en"}

    [:head
     [:meta {:charset "UTF-8"}]
     [:meta {:name "viewport" :content "width=device-width, initial-scale=1.0"}]
     [:title "To-Do App"]
     (include-css "/style.css")]

    [:body
     [:div#app.container

      [:header.page-header [:h1 "To-Do List"]]

      ;; ── Add new to-do ─────────────────────────────────────────────────────
      [:section.card
       [:h2 "Add a To-Do"]
       [:form#add-form {:novalidate true}
        [:div.form-group
         [:label {:for "new-title"} "Title"]
         [:input#new-title {:type "text" :placeholder "What needs to be done?"
                            :autocomplete "off" :required true}]]
        [:div.form-group
         [:label {:for "new-description"}
          "Description " [:span.optional "(optional)"]]
         [:textarea#new-description {:placeholder "Any extra details…" :rows 2}]]
        ;; Category sits on its own row so the label+select have room
        (category-select "new-category")
        [:div.form-row
         [:div.form-group
          [:label {:for "new-due-at"} "Due date " [:span.optional "(optional)"]]
          [:input#new-due-at {:type "date"}]]
         (recurrence-select "new-")]
        [:button.btn.btn-primary {:type "submit"} "Add To-Do"]]]

      ;; ── Categories management ─────────────────────────────────────────────
      ;; app.js renders the chips and wires up the add form; renderCategoryChips() fills the chip list.
      [:section#categories-card.card
       [:h2 "Categories"]
       [:div#category-chips.category-chips]
       [:form#add-category-form {:novalidate true}
        [:div.inline-group
         [:input#new-category-name
          {:type "text" :placeholder "New category name…" :autocomplete "off"}]
         [:button.btn {:type "submit"} "Add"]]]]

      ;; ── List header + category filter bar ────────────────────────────────
      [:div.list-header
       [:span.list-title "To-Dos"]
       [:div.list-controls
        [:label.show-inactive-label
         [:input#show-inactive {:type "checkbox"}]
         "Show paused"]
        [:label.sort-label
         [:span "Sort by"]
         [:select#sort-select
          [:option {:value "created_desc"} "Date added (newest)"]
          [:option {:value "created_asc"}  "Date added (oldest)"]
          [:option {:value "due_asc" :selected true} "Due date (soonest)"]
          [:option {:value "due_desc"}     "Due date (latest)"]]]]]

      ;; Filter buttons — hidden when no categories exist; populated by JS
      [:div#category-filter-bar {:style "display:none"}]

      [:section#todo-list [:p.loading "Loading…"]]

      ;; ── Edit modal ────────────────────────────────────────────────────────
      [:div#edit-modal.modal-backdrop {:aria-hidden "true"}
       [:div.modal-dialog {:role "dialog" :aria-labelledby "modal-heading"}
        [:h2#modal-heading "Edit To-Do"]
        [:input#edit-id {:type "hidden"}]
        [:div.form-group
         [:label {:for "edit-title"} "Title"]
         [:input#edit-title {:type "text" :required true}]]
        [:div.form-group
         [:label {:for "edit-description"}
          "Description " [:span.optional "(optional)"]]
         [:textarea#edit-description {:rows 2}]]
        (category-select "edit-category")
        [:div.form-row
         [:div.form-group
          [:label {:for "edit-due-at"} "Due date " [:span.optional "(optional)"]]
          [:input#edit-due-at {:type "date"}]]
         (recurrence-select "edit-")]
        [:div.modal-footer
         [:button#save-edit.btn.btn-primary "Save"]
         [:button#cancel-edit.btn           "Cancel"]]]]]

     (include-js "/app.js")]))
