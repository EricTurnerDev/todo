(ns todo.views
  "Hiccup HTML templates."
  (:require [hiccup.page :refer [html5 include-css include-js]]))

;; ─────────────────────────────────────────────────────────────────────────────
;; Shared fragments
;; ─────────────────────────────────────────────────────────────────────────────

(defn- page-head [title]
  [:head
   [:meta {:charset "UTF-8"}]
   [:meta {:name "viewport" :content "width=device-width, initial-scale=1.0"}]
   [:title title]
   (include-css "/style.css")])

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

;; ─────────────────────────────────────────────────────────────────────────────
;; Auth pages
;; ─────────────────────────────────────────────────────────────────────────────

(defn login-page [error]
  (html5 {:lang "en"}
    (page-head "Log In — To-Do App")
    [:body
     [:div.auth-container
      [:h1 "To-Do App"]
      [:div.card
       [:h2 "Log In"]
       (when error
         [:p.auth-error error])
       [:form {:method "POST" :action "/auth/login" :novalidate true}
        [:div.form-group
         [:label {:for "email"} "Email"]
         [:input#email {:type "email" :name "email" :required true
                        :autocomplete "email" :placeholder "you@example.com"}]]
        [:div.form-group
         [:label {:for "password"} "Password"]
         [:input#password {:type "password" :name "password" :required true
                           :autocomplete "current-password"}]]
        [:button.btn.btn-primary {:type "submit"} "Log In"]]
       [:p.auth-footer
        "Don't have an account? "
        [:a {:href "/register"} "Register"]]]]]))

(defn register-page [error]
  (html5 {:lang "en"}
    (page-head "Register — To-Do App")
    [:body
     [:div.auth-container
      [:h1 "To-Do App"]
      [:div.card
       [:h2 "Create Account"]
       (when error
         [:p.auth-error error])
       [:form {:method "POST" :action "/auth/register" :novalidate true}
        [:div.form-group
         [:label {:for "email"} "Email"]
         [:input#email {:type "email" :name "email" :required true
                        :autocomplete "email" :placeholder "you@example.com"}]]
        [:div.form-group
         [:label {:for "password"} "Password"]
         [:input#password {:type "password" :name "password" :required true
                           :autocomplete "new-password"
                           :placeholder "At least 8 characters"}]]
        [:div.form-group
         [:label {:for "password2"} "Confirm Password"]
         [:input#password2 {:type "password" :name "password2" :required true
                             :autocomplete "new-password"}]]
        [:button.btn.btn-primary {:type "submit"} "Create Account"]]
       [:p.auth-footer
        "Already have an account? "
        [:a {:href "/login"} "Log In"]]]]]))

;; ─────────────────────────────────────────────────────────────────────────────
;; Main app page
;; ─────────────────────────────────────────────────────────────────────────────

(defn index-page [user-id user-email]
  (html5 {:lang "en"}

    (page-head "To-Do App")

    [:body {:data-user-id user-id}
     [:div#app.container

      [:header.page-header
       [:h1 "To-Do List"]
       [:div.header-right
        ;; Page-level navigation: switches between the To-Dos view and Insights.
        [:nav.page-nav
         [:button.nav-btn.nav-btn--active {:data-section "todos"} "To-Dos"]
         [:button.nav-btn {:data-section "insights"} "Insights"]]
        [:div.header-user
         [:span.header-email user-email]
         [:form.logout-form {:method "POST" :action "/auth/logout"}
          [:button.btn.btn-sm {:type "submit"} "Log Out"]]]]]

      ;; ── Todos section (shown by default) ─────────────────────────────────
      [:div#todos-section

       ;; ── Tabbed card: Add To-Do / Categories ────────────────────────────
       [:section.card
        [:div.tab-strip
         [:button.tab-btn.tab-btn--active {:data-tab "tab-add"} "Add a To-Do"]
         [:button.tab-btn {:data-tab "tab-categories"} "Categories"]]

        [:div#tab-add.tab-panel
         [:form#add-form {:novalidate true}
          [:div.form-group
           [:label {:for "new-title"} "Title"]
           [:input#new-title {:type "text" :placeholder "What needs to be done?"
                              :autocomplete "off" :required true}]]
          [:div.form-group
           [:label {:for "new-description"}
            "Description " [:span.optional "(optional)"]]
           [:textarea#new-description {:placeholder "Any extra details…" :rows 2}]]
          (category-select "new-category")
          [:div.form-row
           [:div.form-group
            [:label {:for "new-due-at"} "Due date " [:span.optional "(optional)"]]
            [:input#new-due-at {:type "date"}]]
           (recurrence-select "new-")]
          [:button.btn.btn-primary {:type "submit"} "Add To-Do"]]]

        [:div#tab-categories.tab-panel {:style "display:none"}
         [:div#category-chips.category-chips]
         [:form#add-category-form {:novalidate true}
          [:div.inline-group
           [:input#new-category-name
            {:type "text" :placeholder "New category name…" :autocomplete "off"}]
           [:button.btn {:type "submit"} "Add"]]
          [:div#new-cat-color-swatches.color-swatch-row]]]]

       ;; ── List header + category filter bar ──────────────────────────────
       [:div.list-header
        [:span.list-title "To-Dos"]
        [:div.list-controls
         [:label.show-inactive-label
          [:input#show-inactive {:type "checkbox"}]
          "Show paused"]
         [:label.show-inactive-label
          [:input#show-completed {:type "checkbox"}]
          "Show completed"]
         [:label.sort-label
          [:span "Sort by"]
          [:select#sort-select
           [:option {:value "created_desc"} "Date added (newest)"]
           [:option {:value "created_asc"}  "Date added (oldest)"]
           [:option {:value "due_asc" :selected true} "Due date (soonest)"]
           [:option {:value "due_desc"}     "Due date (latest)"]]]]]

       ;; Filter buttons — hidden when no categories exist; populated by JS
       [:div#category-filter-bar {:style "display:none"}]

       [:div#encouragement-banner {:style "display:none"}]
       [:section#todo-list [:p.loading "Loading…"]]]

      ;; ── Insights section (hidden by default; populated by JS on demand) ──
      [:section#insights-section {:style "display:none"}
       [:p.loading "Loading insights…"]]

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
