import { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { GoogleSignIn } from "@capawesome/capacitor-google-sign-in";
import "./App.css";
import MpesaImport from "./MpesaImport";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://192.168.0.108:8000";

const today = () => {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const currentMonth = () => today().slice(0, 7);

const emptyExpenseForm = () => ({
  transaction_date: today(),
  amount: "",
  category_id: "",
  description: "",
  notes: "",
});

const emptyIncomeForm = () => ({
  income_date: today(),
  amount: "",
  source: "",
  description: "",
  notes: "",
});

function App() {
  // ================================================
  // AUTHENTICATION STATE
  // ================================================

const [token, setToken] = useState(null);
const [authReady, setAuthReady] = useState(false);


  const [authMode, setAuthMode] = useState("login");

  const [loginForm, setLoginForm] = useState({
    username: "",
    password: "",
  });

  const [registerForm, setRegisterForm] = useState({
  full_name: "",
  username: "",
  email: "",
  confirm_email: "",
  password: "",
  confirm_password: "",
});

  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [displayName, setDisplayName] = useState(() => {
    try { return localStorage.getItem("finance_display_name") || ""; }
    catch { return ""; }
  });

  // ================================================
  // DASHBOARD STATE
  // ================================================

  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [activeTab, setActiveTab] = useState("home");
  const [expandedForm, setExpandedForm] = useState(null);
  const [transactionSearch, setTransactionSearch] = useState("");
  const [transactionCategoryFilter, setTransactionCategoryFilter] = useState("all");
  const [transactionTypeFilter, setTransactionTypeFilter] = useState("all");
  const [transactionDateFrom, setTransactionDateFrom] = useState("");
  const [transactionDateTo, setTransactionDateTo] = useState("");

  // This month selector belongs only to the Monthly Spending chart.
  const [monthlySpendingMonth, setMonthlySpendingMonth] =
    useState(currentMonth);

  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [income, setIncome] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [profile, setProfile] = useState(null);

  // Savings goals and contributions
  const [savingsGoals, setSavingsGoals] = useState([]);
  const [savingsContributions, setSavingsContributions] = useState([]);
  const [selectedSavingsGoal, setSelectedSavingsGoal] = useState(null);

  const [savingsGoalForm, setSavingsGoalForm] = useState({
  name: "",
  target_amount: "",
  target_date: "",
  description: "",
  });

  const [savingsContributionForm, setSavingsContributionForm] = useState({
  amount: "",
  contribution_date: new Date().toISOString().slice(0, 10),
  notes: "",
  });

  const [editingSavingsGoalId, setEditingSavingsGoalId] = useState(null);
  const [savingsLoading, setSavingsLoading] = useState(false);


  const [budgetInputs, setBudgetInputs] = useState({});

  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm);
  const [incomeForm, setIncomeForm] = useState(emptyIncomeForm);

  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [editingIncomeId, setEditingIncomeId] = useState(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const authHeaders = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  // ================================================
  // DERIVED DATA
  // ================================================

  const expenseCategories = useMemo(
    () => categories.filter((category) => category.type === "expense"),
    [categories]
  );

  const savedBudgetTotal = useMemo(
    () =>
      budgets.reduce(
        (total, budget) => total + Number(budget.budget_amount || 0),
        0
      ),
    [budgets]
  );

  // ================================================
  // MESSAGES
  // ================================================

  function showMessage(text) {
    setMessage(text);
    setError("");
  }

  function showError(text) {
    setError(text);
    setMessage("");
  }

  function clearMessages() {
    setMessage("");
    setError("");
  }

  function switchAuthMode(mode) {
    setAuthMode(mode);
    clearMessages();
  }

  // ================================================
  // LOGIN
  // ================================================

  async function handleLogin(event) {
    event.preventDefault();
    clearMessages();
    setAuthSubmitting(true);

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(loginForm),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail || "Unable to sign in. Check your credentials."
        );
      }

      if (!data.access_token) {
        throw new Error("The server did not return an access token.");
      }

            if (Capacitor.isNativePlatform()) {
        await SecureStorage.setItem("finance_token", data.access_token);
      } else {
        localStorage.setItem("finance_token", data.access_token);
      }
      setToken(data.access_token);
      const signedInName = String(data.user?.full_name || data.full_name || loginForm.username.trim());
      setDisplayName(signedInName);
      try { localStorage.setItem("finance_display_name", signedInName); } catch {}

      setLoginForm({
        username: "",
        password: "",
      });

      showMessage("Login successful.");
    } catch (err) {
      showError(err.message || "Unable to sign in.");
    } finally {
      setAuthSubmitting(false);
    }
  }

    async function handleGoogleLogin() {
    clearMessages();
    setAuthSubmitting(true);

    try {
      const result = await GoogleSignIn.signIn();

      // Web sign-in redirects to Google and returns to the app.
      // The web redirect callback handles authentication separately.
      if (!Capacitor.isNativePlatform()) {
        return;
      }

      if (!result?.idToken) {
        throw new Error("Google did not return an ID token.");
      }

      const response = await fetch(`${API_BASE}/auth/google`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          credential: result.idToken,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail || "Unable to sign in with Google."
        );
      }

      if (!data.access_token) {
        throw new Error("The server did not return an access token.");
      }

      await SecureStorage.setItem("finance_token", data.access_token);
      setToken(data.access_token);

      const signedInName = String(
        data.user?.full_name ||
          result.displayName ||
          result.email ||
          "OTHRU User"
      );

      setDisplayName(signedInName);

      try {
        localStorage.setItem("finance_display_name", signedInName);
      } catch {}

      showMessage("Google sign-in successful.");
    } catch (error) {
      console.error("Google Sign-In error:", error);
      showError(error.message || "Unable to sign in with Google.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  // ================================================
  // REGISTRATION
  // ================================================

  async function handleRegister(event) {
    event.preventDefault();
    clearMessages();

   if (
  !registerForm.full_name.trim() ||
  !registerForm.username.trim() ||
  !registerForm.email.trim() ||
  !registerForm.confirm_email.trim() ||
  !registerForm.password ||
  !registerForm.confirm_password
) {
  showError("Please complete all six required fields.");
  return;
}

const email = registerForm.email.trim().toLowerCase();
const confirmEmail = registerForm.confirm_email.trim().toLowerCase();

if (email !== confirmEmail) {
  showError("Your email addresses do not match. Please check and try again.");
  return;
}

if (registerForm.password.length < 8) {
  showError("Your password must contain at least 8 characters.");
  return;
}

if (registerForm.password !== registerForm.confirm_password) {
  showError("Your passwords do not match. Please check and try again.");
  return;
}

    setAuthSubmitting(true);

    try {
      const payload = {
        full_name: registerForm.full_name.trim(),
        username: registerForm.username.trim(),
        email: registerForm.email.trim(),
        password: registerForm.password,
      };

      const response = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map((item) => item.msg).join(", ")
          : data.detail;

        throw new Error(detail || "Unable to create your account.");
      }

      const newUsername = registerForm.username.trim();

      setRegisterForm({
        full_name: "",
        username: "",
        email: "",
        confirm_email: "",
        password: "",
        confirm_password: "",
    });

    setLoginForm({
      username: newUsername,
      password: "",
    });

    setAuthMode("login");

    showMessage(
      data.message ||
        "Account created successfully. Please check your email and verify your address before signing in."
    );
    } catch (err) {
      showError(err.message || "Unable to create your account.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  // ================================================
  // LOGOUT
  // ================================================

  async function logout() {
        try {
      if (Capacitor.isNativePlatform()) {
        await SecureStorage.removeItem("finance_token");
      } else {
        localStorage.removeItem("finance_token");
      }
    } catch (error) {
      console.error("Unable to remove saved token:", error);
    }
    setToken(null);
    setDisplayName("");
    try { localStorage.removeItem("finance_display_name"); } catch {}

    setCategories([]);
    setTransactions([]);
    setIncome([]);
    setBudgets([]);
    setDashboard(null);
    setAnalytics(null);
    setBudgetInputs({});

    setEditingExpenseId(null);
    setEditingIncomeId(null);

    setExpenseForm(emptyExpenseForm());
    setIncomeForm(emptyIncomeForm());

    setAuthMode("login");
    clearMessages();
  }

  async function deleteAccount() {
  const confirmation = window.prompt(
    'This will permanently delete your OTHRU account and associated financial records.\n\n' +
      'This action cannot be undone.\n\n' +
      'Type DELETE MY ACCOUNT to confirm:'
  );

  if (confirmation === null) {
    return;
  }

  if (confirmation.trim() !== "DELETE MY ACCOUNT") {
    setError('Account deletion cancelled. The confirmation phrase did not match.');
    return;
  }

  if (!token) {
    setError("You must be logged in to delete your account.");
    return;
  }

  try {
    setError("");
    setMessage("");

    const response = await fetch(`${API_BASE}/auth/account`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        confirmation: "DELETE MY ACCOUNT",
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.detail || "Unable to delete your account. Please try again."
      );
    }

    await logout();

    setMessage(
      "Your OTHRU account and associated financial records have been deleted."
    );
  } catch (error) {
    console.error("Account deletion failed:", error);

    setError(
      error.message ||
        "Account deletion failed. Please try again."
    );
  }
}

  // ================================================
  // LOAD DASHBOARD DATA
  // ================================================

 async function fetchData() {
  if (!token) {
    setLoading(false);
    return;
  }

  try {
    setLoading(true);
    setError("");

    const headers = {
      Authorization: `Bearer ${token}`,
    };
    const profileResponse = await fetch(`${API_BASE}/auth/me`, { headers });

if (!profileResponse.ok) {
  if (profileResponse.status === 401) {
    logout();
    showError("Your session has expired. Please sign in again.");
    return;
  }

  throw new Error("Unable to load your profile.");
}

const profileData = await profileResponse.json();
setProfile(profileData);

    const [
      categoriesResponse,
      transactionsResponse,
      incomeResponse,
      budgetsResponse,
      dashboardResponse,
      analyticsResponse,
      savingsGoalsResponse,
    ] = await Promise.all([
      fetch(`${API_BASE}/categories`, { headers }),
      fetch(`${API_BASE}/transactions`, { headers }),
      fetch(`${API_BASE}/income`, { headers }),
      fetch(`${API_BASE}/budgets?month=${selectedMonth}`, { headers }),
      fetch(`${API_BASE}/dashboard?month=${selectedMonth}`, { headers }),
      fetch(`${API_BASE}/analytics?month=${selectedMonth}`, { headers }),
      fetch(`${API_BASE}/savings-goals`, { headers }),
    ]);

    const responses = [
      categoriesResponse,
      transactionsResponse,
      incomeResponse,
      budgetsResponse,
      dashboardResponse,
      analyticsResponse,
      savingsGoalsResponse,
    ];

    const failedResponse = responses.find(
      (response) => !response.ok
    );

    if (failedResponse) {
      if (failedResponse.status === 401) {
        logout();
        showError("Your session has expired. Please sign in again.");
        return;
      }

      const data = await failedResponse.json().catch(() => ({}));

      throw new Error(
        data.detail || "Failed to load financial data."
      );
    }

    const [
      categoriesData,
      transactionsData,
      incomeData,
      budgetsData,
      dashboardData,
      analyticsData,
      savingsGoalsData,
    ] = await Promise.all(
      responses.map((response) => response.json())
    );

    setCategories(categoriesData);
    setTransactions(transactionsData);
    setIncome(incomeData);
    setBudgets(budgetsData);
    setDashboard(dashboardData);
    setAnalytics(analyticsData);
    setSavingsGoals(savingsGoalsData);

    const inputValues = {};

    categoriesData
      .filter((category) => category.type === "expense")
      .forEach((category) => {
        inputValues[category.id] = "";
      });

    budgetsData.forEach((budget) => {
      inputValues[budget.category_id] = budget.budget_amount;
    });

    setBudgetInputs(inputValues);
  } catch (err) {
    showError(err.message || "Unable to load dashboard data.");
  } finally {
    setLoading(false);
  }
}

  useEffect(() => {
  let isMounted = true;

  const loadStoredToken = async () => {
    try {
      const savedToken = Capacitor.isNativePlatform()
        ? await SecureStorage.getItem("finance_token")
        : localStorage.getItem("finance_token");

      if (isMounted) {
        setToken(savedToken);
      }
    } catch (error) {
      console.error("Unable to retrieve saved token:", error);

      if (isMounted) {
        setToken(null);
      }
    } finally {
      if (isMounted) {
        setAuthReady(true);
      }
    }
  };

  loadStoredToken();

  return () => {
    isMounted = false;
  };
}, []);

    useEffect(() => {
    if (!authReady) {
      return;
    }

    if (token) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [token, selectedMonth, authReady]);

  useEffect(() => {
  const initializeGoogleSignIn = async () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    if (!clientId) {
      console.error("Google Sign-In: Web Client ID is missing.");
      return;
    }

    try {
      await GoogleSignIn.initialize({
        clientId,
        redirectUrl: window.location.origin,
      });

      console.log("Google Sign-In initialized.");

      // Process Google's redirect only when an authorization
      // code is present in the browser URL.
      if (
        !Capacitor.isNativePlatform() &&
        new URLSearchParams(window.location.hash.substring(1)).has("id_token")
      ) {
        const result = await GoogleSignIn.handleRedirectCallback();

  // No pending Google redirect? Continue normal app loading.
      if (!result) {
        return;
     }

      if (!result.idToken) {
      throw new Error("Google did not return an ID token.");
    }

        const response = await fetch(`${API_BASE}/auth/google`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            credential: result.idToken,
          }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.detail || "Google sign-in failed."
          );
        }

        if (!data.access_token) {
          throw new Error("The server did not return an access token.");
        }

        localStorage.setItem("finance_token", data.access_token);

        setToken(data.access_token);

        const signedInName = String(
          data.user?.full_name ||
            result.displayName ||
            result.email ||
            "OTHRU User"
        );

        setDisplayName(signedInName);
        localStorage.setItem("finance_display_name", signedInName);

        // Remove the OAuth parameters from the address bar.
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );

        showMessage("Google sign-in successful.");
      }
    } catch (error) {
      console.error("Google Sign-In error:", error);
      showError(error.message || "Google sign-in failed.");
    }
  };

  initializeGoogleSignIn();
}, []);
  // ================================================
  // FORM HANDLERS
  // ================================================

  function handleExpenseChange(event) {
    const { name, value } = event.target;

    setExpenseForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function handleIncomeChange(event) {
    const { name, value } = event.target;

    setIncomeForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function handleBudgetChange(categoryId, value) {
    setBudgetInputs((previous) => ({
      ...previous,
      [categoryId]: value,
    }));
  }

  // ================================================
  // SAVE EXPENSE
  // ================================================

  async function saveExpense(event) {
    event.preventDefault();

    if (!expenseForm.amount || Number(expenseForm.amount) <= 0) {
      showError("Enter an expense amount greater than zero.");
      return;
    }

    if (!expenseForm.category_id) {
      showError("Select an expense category.");
      return;
    }

    const wasEditing = Boolean(editingExpenseId);

    const payload = {
      transaction_date: expenseForm.transaction_date,
      amount: Number(expenseForm.amount),
      category_id: Number(expenseForm.category_id),
      description: expenseForm.description,
      notes: expenseForm.notes,
      transaction_type: "expense",
      source: "manual",
    };

    try {
      const url = wasEditing
        ? `${API_BASE}/expenses/${editingExpenseId}`
        : `${API_BASE}/expenses`;

      const response = await fetch(url, {
        method: wasEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 401) {
        logout();
        showError("Your session has expired. Please sign in again.");
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to save expense.");
      }

      setExpenseForm(emptyExpenseForm());
      setEditingExpenseId(null);
      setExpandedForm(null);

      showMessage(wasEditing ? "Expense updated." : "Expense added.");
      await fetchData();
    } catch (err) {
      showError(err.message || "Unable to save expense.");
    }
  }

  // ================================================
  // EDIT EXPENSE
  // ================================================

  function editExpense(expense) {
    setActiveTab("transactions");
    setExpandedForm("expense");
    setEditingExpenseId(expense.id);

    setExpenseForm({
      transaction_date: expense.transaction_date,
      amount: expense.amount,
      category_id: String(expense.category_id),
      description: expense.description || "",
      notes: expense.notes || "",
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // ================================================
  // DELETE EXPENSE
  // ================================================

  async function deleteExpense(id) {
    if (!window.confirm("Delete this expense?")) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/expenses/${id}`, {
        method: "DELETE",
        headers: authHeaders,
      });

      if (response.status === 401) {
        logout();
        showError("Your session has expired. Please sign in again.");
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to delete expense.");
      }

      if (Number(editingExpenseId) === Number(id)) {
        setEditingExpenseId(null);
        setExpenseForm(emptyExpenseForm());
      }

      showMessage("Expense deleted.");
      await fetchData();
    } catch (err) {
      showError(err.message || "Unable to delete expense.");
    }
  }

  // ================================================
  // SAVE INCOME
  // ================================================

  async function saveIncome(event) {
    event.preventDefault();

    if (!incomeForm.amount || Number(incomeForm.amount) <= 0) {
      showError("Enter an income amount greater than zero.");
      return;
    }

    if (!incomeForm.source.trim()) {
      showError("Enter an income source.");
      return;
    }

    const wasEditing = Boolean(editingIncomeId);

    const payload = {
      income_date: incomeForm.income_date,
      amount: Number(incomeForm.amount),
      source: incomeForm.source.trim(),
      description: incomeForm.description,
      notes: incomeForm.notes,
    };

    try {
      const url = wasEditing
        ? `${API_BASE}/income/${editingIncomeId}`
        : `${API_BASE}/income`;

      const response = await fetch(url, {
        method: wasEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 401) {
        logout();
        showError("Your session has expired. Please sign in again.");
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to save income.");
      }

      setIncomeForm(emptyIncomeForm());
      setEditingIncomeId(null);
      setExpandedForm(null);

      showMessage(wasEditing ? "Income updated." : "Income added.");
      await fetchData();
    } catch (err) {
      showError(err.message || "Unable to save income.");
    }
  }
  async function saveSavingsGoal(event) {
event.preventDefault();

if (!savingsGoalForm.name.trim()) {
  showError("Enter a name for your savings goal.");
  return;
}

if (
  !savingsGoalForm.target_amount ||
  Number(savingsGoalForm.target_amount) <= 0
) {
  showError("Enter a target amount greater than zero.");
  return;
}

const wasEditing = Boolean(editingSavingsGoalId);

const payload = {
  name: savingsGoalForm.name.trim(),
  target_amount: Number(savingsGoalForm.target_amount),
  target_date: savingsGoalForm.target_date || null,
  description: savingsGoalForm.description.trim() || null,
};

try {
  setSavingsLoading(true);
  setError("");

  const response = await fetch(
    wasEditing
      ? `${API_BASE}/savings-goals/${editingSavingsGoalId}`
      : `${API_BASE}/savings-goals`,
    {
      method: wasEditing ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify(payload),
    }
  );

  if (response.status === 401) {
    logout();
    showError("Your session has expired. Please sign in again.");
    return;
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || "Failed to save savings goal.");
  }

  setSavingsGoalForm({
    name: "",
    target_amount: "",
    target_date: "",
    description: "",
  });
  setEditingSavingsGoalId(null);

  showMessage(wasEditing ? "Savings goal updated." : "Savings goal created.");
  await fetchData();
} catch (err) {
  showError(err.message || "Unable to save savings goal.");
} finally {
  setSavingsLoading(false);
}

}

function startEditingSavingsGoal(goal) {
setEditingSavingsGoalId(goal.id);
setSavingsGoalForm({
name: goal.name || "",
target_amount: String(goal.target_amount ?? ""),
target_date: goal.target_date ? String(goal.target_date).slice(0, 10) : "",
description: goal.description || "",
});
setSelectedSavingsGoal(goal.id);
}

function cancelEditingSavingsGoal() {
  setEditingSavingsGoalId(null);

  setSavingsGoalForm({
    name: "",
    target_amount: "",
    target_date: "",
    description: "",
  });
}

async function deleteSavingsGoal(goal) {
const confirmed = window.confirm(
`Delete the savings goal "${goal.name}" and its contribution history? This cannot be undone.`
);
if (!confirmed) return;

try {
  setSavingsLoading(true);

  const response = await fetch(
    `${API_BASE}/savings-goals/${goal.id}`,
    {
      method: "DELETE",
      headers: authHeaders,
    }
  );

  if (response.status === 401) {
    logout();
    showError("Your session has expired. Please sign in again.");
    return;
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || "Failed to delete savings goal.");
  }

  if (selectedSavingsGoal === goal.id) {
    setSelectedSavingsGoal(null);
    setSavingsContributions([]);
  }

  if (editingSavingsGoalId === goal.id) {
    cancelEditingSavingsGoal();
  }

  showMessage("Savings goal deleted.");
  await fetchData();
} catch (err) {

  showError(err.message || "Unable to delete savings goal.");

} finally {

  setSavingsLoading(false);
  }
}


async function loadSavingsContributions(goalId) {
try {
setSavingsLoading(true);
  const response = await fetch(
    `${API_BASE}/savings-goals/${goalId}/contributions`,
    { headers: authHeaders }
  );

  if (response.status === 401) {
    logout();
    showError("Your session has expired. Please sign in again.");
    return;
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || "Failed to load savings history.");
  }

  const data = await response.json();
  setSavingsContributions(data);
  setSelectedSavingsGoal(goalId);
} catch (err) {
  showError(err.message || "Unable to load savings history.");
} finally {
  setSavingsLoading(false);
}
}

async function saveSavingsContribution(event) {
event.preventDefault();
if (!selectedSavingsGoal) {
  showError("Select a savings goal first.");
  return;
}

if (
  !savingsContributionForm.amount ||
  Number(savingsContributionForm.amount) <= 0
) {
  showError("Enter a contribution amount greater than zero.");
  return;
}

const payload = {
  amount: Number(savingsContributionForm.amount),
  contribution_date: savingsContributionForm.contribution_date,
  notes: savingsContributionForm.notes.trim() || null,
};

try {
  setSavingsLoading(true);

  const response = await fetch(
    `${API_BASE}/savings-goals/${selectedSavingsGoal}/contributions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify(payload),
    }
  );

  if (response.status === 401) {
    logout();
    showError("Your session has expired. Please sign in again.");
    return;
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || "Failed to record contribution.");
  }

  setSavingsContributionForm({
    amount: "",
    contribution_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  showMessage("Savings contribution recorded.");
  await fetchData();
  await loadSavingsContributions(selectedSavingsGoal);
} catch (err) {
  showError(err.message || "Unable to record savings contribution.");
} finally {
  setSavingsLoading(false);
}
}

  // ================================================
  // EDIT INCOME
  // ================================================

  function editIncome(item) {
    setActiveTab("transactions");
    setExpandedForm("income");
    setEditingIncomeId(item.id);

    setIncomeForm({
      income_date: item.income_date,
      amount: item.amount,
      source: item.source || "",
      description: item.description || "",
      notes: item.notes || "",
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // ================================================
  // DELETE INCOME
  // ================================================

  async function deleteIncome(id) {
    if (!window.confirm("Delete this income entry?")) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/income/${id}`, {
        method: "DELETE",
        headers: authHeaders,
      });

      if (response.status === 401) {
        logout();
        showError("Your session has expired. Please sign in again.");
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to delete income.");
      }

      if (Number(editingIncomeId) === Number(id)) {
        setEditingIncomeId(null);
        setIncomeForm(emptyIncomeForm());
      }

      showMessage("Income deleted.");
      await fetchData();
    } catch (err) {
      showError(err.message || "Unable to delete income.");
    }
  }

  // ================================================
  // SAVE BUDGET
  // ================================================

  async function saveBudget(categoryId) {
    const rawAmount = budgetInputs[categoryId];

    if (rawAmount === "" || rawAmount === undefined) {
      showError("Enter a budget amount.");
      return;
    }

    const amount = Number(rawAmount);

    if (!Number.isFinite(amount) || amount < 0) {
      showError("Budget amount must be zero or greater.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/budgets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          budget_month: `${selectedMonth}-01`,
          category_id: Number(categoryId),
          budget_amount: amount,
        }),
      });

      if (response.status === 401) {
        logout();
        showError("Your session has expired. Please sign in again.");
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to save budget.");
      }

      showMessage("Budget saved.");
      await fetchData();
    } catch (err) {
      showError(err.message || "Unable to save budget.");
    }
  }

  // ================================================
  // DELETE BUDGET
  // ================================================

  async function deleteBudget(categoryId) {
    const existingBudget = budgets.find(
      (budget) => Number(budget.category_id) === Number(categoryId)
    );

    if (!existingBudget) {
      return;
    }

    if (
      !window.confirm(
        "Remove the budget for this category for the selected month?"
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE}/budgets/${existingBudget.id}`,
        {
          method: "DELETE",
          headers: authHeaders,
        }
      );

      if (response.status === 401) {
        logout();
        showError("Your session has expired. Please sign in again.");
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to remove budget.");
      }

      showMessage("Budget removed.");
      await fetchData();
    } catch (err) {
      showError(err.message || "Unable to remove budget.");
    }
  }

  function exportTransactionsCsv() {
    const dataRows = [
      ...selectedMonthExpenses.map((item) => [item.transaction_date, "Expense", item.amount, getCategoryName(item.category_id), item.description || "", item.notes || ""]),
      ...selectedMonthIncome.map((item) => [item.income_date, "Income", item.amount, item.source || "", item.description || "", item.notes || ""]),
    ].sort((a, b) => String(b[0]).localeCompare(String(a[0])));
    const rows = [["Date", "Type", "Amount (KES)", "Category / Source", "Description", "Notes"], ...dataRows];
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `othru-transactions-${selectedMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showMessage(`CSV export prepared for ${selectedMonthLabel}.`);
  }

  function printMonthlyReport() {
    window.print();
  }

  // ================================================
  // FORMATTING HELPERS
  // ================================================

  function getCategoryName(categoryId) {
    const category = categories.find(
      (item) => Number(item.id) === Number(categoryId)
    );

    return category ? category.name : "Uncategorized";
  }

  function formatMoney(value) {
    return `KES ${Number(value || 0).toLocaleString("en-KE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function formatPercent(value) {
    return `${Number(value || 0).toFixed(1)}%`;
  }

  function formatMonthLabel(monthValue) {
    if (!/^\d{4}-\d{2}$/.test(monthValue || "")) {
      return monthValue;
    }

    const [year, month] = monthValue.split("-").map(Number);

    return new Date(year, month - 1, 1).toLocaleDateString("en-KE", {
      month: "long",
      year: "numeric",
    });
  }

  // ================================================
  // MONTH OPTIONS FOR MONTHLY SPENDING DROPDOWN
  // ================================================

  const monthlySpendingMonthOptions = useMemo(() => {
    const options = [];
    const [selectedYear, selectedMonthNumber] = monthlySpendingMonth
      .split("-")
      .map(Number);

    const selectedDate = new Date(
      selectedYear,
      selectedMonthNumber - 1,
      1
    );

    // Include the most recent 24 months, plus the selected month if it
    // falls outside that range.
    const now = new Date();

    for (let offset = 0; offset < 24; offset += 1) {
      const date = new Date(
        now.getFullYear(),
        now.getMonth() - offset,
        1
      );

      options.push({
        value: `${date.getFullYear()}-${String(
          date.getMonth() + 1
        ).padStart(2, "0")}`,
        label: date.toLocaleDateString("en-KE", {
          month: "long",
          year: "numeric",
        }),
      });
    }

    const selectedValue = `${selectedDate.getFullYear()}-${String(
      selectedDate.getMonth() + 1
    ).padStart(2, "0")}`;

    if (!options.some((option) => option.value === selectedValue)) {
      options.push({
        value: selectedValue,
        label: selectedDate.toLocaleDateString("en-KE", {
          month: "long",
          year: "numeric",
        }),
      });
    }

    return options.sort((a, b) => b.value.localeCompare(a.value));
  }, [monthlySpendingMonth]);

  // ================================================
  // MONTHLY CALCULATIONS FOR MAIN DASHBOARD
  // ================================================

  const selectedMonthLabel = formatMonthLabel(selectedMonth);

  const [selectedYear, selectedMonthNumber] = selectedMonth
    .split("-")
    .map(Number);

  const daysInSelectedMonth = new Date(
    selectedYear,
    selectedMonthNumber,
    0
  ).getDate();

  const selectedMonthExpenses = transactions.filter((transaction) => {
    return (
      transaction.transaction_type === "expense" &&
      String(transaction.transaction_date || "").startsWith(selectedMonth)
    );
  });

  const selectedMonthIncome = income.filter((item) =>
    String(item.income_date || "").startsWith(selectedMonth)
  );

  const categorySpending = useMemo(
    () =>
      [...(analytics?.category_spending || [])].sort(
        (a, b) => Number(b.amount || 0) - Number(a.amount || 0)
      ),
    [analytics]
  );

  const budgetActualData = useMemo(() => expenseCategories.map((category) => {
    const budget = budgets.find((item) => Number(item.category_id) === Number(category.id));
    const spent = selectedMonthExpenses
      .filter((item) => Number(item.category_id) === Number(category.id))
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return { category: category.name, budget: Number(budget?.budget_amount || 0), spent };
  }).filter((item) => item.budget > 0 || item.spent > 0).sort((a, b) => Math.max(b.budget, b.spent) - Math.max(a.budget, a.spent)), [expenseCategories, budgets, selectedMonthExpenses]);

  const incomeSourceData = useMemo(() => {
    const totals = {};
    selectedMonthIncome.forEach((item) => {
      const source = String(item.source || "Other").trim() || "Other";
      totals[source] = (totals[source] || 0) + Number(item.amount || 0);
    });
    return Object.entries(totals).map(([source, amount]) => ({ source, amount })).sort((a, b) => b.amount - a.amount);
  }, [selectedMonthIncome]);

  const monthlyTrendData = useMemo(() => {
    const months = [];
    const now = new Date(`${selectedMonth}-01T12:00:00`);
    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const expenseTotal = transactions
        .filter((item) => (item.transaction_type === "expense" || !item.transaction_type) && String(item.transaction_date || "").startsWith(key))
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const incomeTotal = income
        .filter((item) => String(item.income_date || "").startsWith(key))
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
      months.push({
        key,
        label: date.toLocaleDateString("en-KE", { month: "short" }),
        income: incomeTotal,
        expenses: expenseTotal,
        net: incomeTotal - expenseTotal,
      });
    }
    return months;
  }, [selectedMonth, transactions, income]);

  const filteredMonthExpenses = useMemo(() => {
    const query = transactionSearch.trim().toLowerCase();
    return selectedMonthExpenses.filter((item) => {
      const date = String(item.transaction_date || "").slice(0, 10);
      const category = getCategoryName(item.category_id).toLowerCase();
      const searchable = `${category} ${item.description || ""} ${item.notes || ""}`.toLowerCase();
      return (transactionTypeFilter === "all" || transactionTypeFilter === "expense") &&
        (transactionCategoryFilter === "all" || String(item.category_id) === transactionCategoryFilter) &&
        (!query || searchable.includes(query)) &&
        (!transactionDateFrom || date >= transactionDateFrom) &&
        (!transactionDateTo || date <= transactionDateTo);
    });
  }, [selectedMonthExpenses, transactionSearch, transactionCategoryFilter, transactionTypeFilter, transactionDateFrom, transactionDateTo, categories]);

  const filteredMonthIncome = useMemo(() => {
    const query = transactionSearch.trim().toLowerCase();
    return selectedMonthIncome.filter((item) => {
      const date = String(item.income_date || "").slice(0, 10);
      const searchable = `${item.source || ""} ${item.description || ""} ${item.notes || ""}`.toLowerCase();
      return (transactionTypeFilter === "all" || transactionTypeFilter === "income") &&
        (!query || searchable.includes(query)) &&
        (!transactionDateFrom || date >= transactionDateFrom) &&
        (!transactionDateTo || date <= transactionDateTo);
    });
  }, [selectedMonthIncome, transactionSearch, transactionTypeFilter, transactionDateFrom, transactionDateTo]);

  const dailySpending = useMemo(() => {
    const totalsByDay = {};

    selectedMonthExpenses.forEach((expense) => {
      const date = String(expense.transaction_date || "").slice(0, 10);

      if (!date.startsWith(selectedMonth)) {
        return;
      }

      const day = Number(date.slice(8, 10));

      if (
        !Number.isInteger(day) ||
        day < 1 ||
        day > daysInSelectedMonth
      ) {
        return;
      }

      totalsByDay[day] =
        (totalsByDay[day] || 0) + Number(expense.amount || 0);
    });

    return Array.from({ length: daysInSelectedMonth }, (_, index) => {
      const day = index + 1;

      return {
        date: `${selectedMonth}-${String(day).padStart(2, "0")}`,
        day,
        amount: Number(totalsByDay[day] || 0),
      };
    });
  }, [selectedMonthExpenses, selectedMonth, daysInSelectedMonth]);

  const totalIncome = Number(analytics?.summary?.income || 0);
  const totalExpenses = Number(analytics?.summary?.expenses || 0);

  const calculatedMonthlySpending = dailySpending.reduce(
    (total, day) => total + day.amount,
    0
  );

  const maxDailySpending = Math.max(
    1,
    ...dailySpending.map((day) => day.amount)
  );

  const daysWithSpending = dailySpending.filter(
    (day) => day.amount > 0
  ).length;

  const highestSpendingDay = dailySpending.reduce(
    (highest, day) =>
      day.amount > highest.amount ? day : highest,
    { date: "", day: 0, amount: 0 }
  );

  const averageDailySpending =
    daysInSelectedMonth > 0
      ? calculatedMonthlySpending / daysInSelectedMonth
      : 0;

  const averageSpendingOnRecordedDays =
    daysWithSpending > 0
      ? calculatedMonthlySpending / daysWithSpending
      : 0;

  const cashRemaining = Number(
    analytics?.summary?.cash_remaining || 0
  );

  const budgetTotal = Number(analytics?.budget?.total || 0);

  const budgetRemaining = Number(
    analytics?.budget?.remaining || 0
  );

  const budgetPercentageUsed = Number(
    analytics?.budget?.percentage_used || 0
  );

  const savingsRate = Number(
    analytics?.summary?.savings_rate || 0
  );

  const projectedSpending = Number(
    analytics?.projection?.projected_month_end_spending || 0
  );

  const projectedCash = Number(
    analytics?.projection?.projected_month_end_cash || 0
  );

  const expectedBudgetUsed = Number(
    analytics?.spending_pace?.expected_budget_used || 0
  );

  const actualBudgetUsed = Number(
    analytics?.spending_pace?.actual_budget_used || 0
  );

  const spendingPaceDifference = Number(
    analytics?.spending_pace?.difference || 0
  );

  const financialHealth = analytics?.financial_health || "—";
  const spendingPace = analytics?.spending_pace?.status || "—";

  const maxCategorySpending = Math.max(
    1,
    ...categorySpending.map((item) => Number(item.amount || 0))
  );

  // ================================================
  // MONTHLY SPENDING CHART DATA
  // This selector is independent of the main dashboard month.
  // ================================================

  const [monthlyChartYear, monthlyChartMonthNumber] =
    monthlySpendingMonth.split("-").map(Number);

  const daysInMonthlyChartMonth = new Date(
    monthlyChartYear,
    monthlyChartMonthNumber,
    0
  ).getDate();

  const monthlyChartLabel = formatMonthLabel(monthlySpendingMonth);

  const monthlyChartExpenses = useMemo(() => {
    return transactions.filter((transaction) => {
      return (
        transaction.transaction_type === "expense" &&
        String(transaction.transaction_date || "").startsWith(
          monthlySpendingMonth
        )
      );
    });
  }, [transactions, monthlySpendingMonth]);

  const monthlyChartDailySpending = useMemo(() => {
    const totalsByDay = {};

    monthlyChartExpenses.forEach((expense) => {
      const date = String(expense.transaction_date || "").slice(0, 10);

      if (!date.startsWith(monthlySpendingMonth)) {
        return;
      }

      const day = Number(date.slice(8, 10));

      if (
        !Number.isInteger(day) ||
        day < 1 ||
        day > daysInMonthlyChartMonth
      ) {
        return;
      }

      totalsByDay[day] =
        (totalsByDay[day] || 0) + Number(expense.amount || 0);
    });

    return Array.from(
      { length: daysInMonthlyChartMonth },
      (_, index) => {
        const day = index + 1;

        return {
          date: `${monthlySpendingMonth}-${String(day).padStart(2, "0")}`,
          day,
          amount: Number(totalsByDay[day] || 0),
        };
      }
    );
  }, [
    monthlyChartExpenses,
    monthlySpendingMonth,
    daysInMonthlyChartMonth,
  ]);

  const monthlyChartTotal = monthlyChartDailySpending.reduce(
    (total, day) => total + day.amount,
    0
  );

  const monthlyChartMaxDailySpending = Math.max(
    1,
    ...monthlyChartDailySpending.map((day) => day.amount)
  );

  const monthlyChartDaysWithSpending = monthlyChartDailySpending.filter(
    (day) => day.amount > 0
  ).length;

  const monthlyChartHighestSpendingDay = monthlyChartDailySpending.reduce(
    (highest, day) =>
      day.amount > highest.amount ? day : highest,
    { date: "", day: 0, amount: 0 }
  );

  const monthlyChartAverageDailySpending =
    daysInMonthlyChartMonth > 0
      ? monthlyChartTotal / daysInMonthlyChartMonth
      : 0;

  // ================================================
  // LOGIN AND REGISTRATION SCREEN
  // ================================================

  if (!token) {
    return (
      <div className="app auth-app">
        <div className="auth-layout">
          <section className="auth-brand-panel" aria-label="About OTHRU Personal Finance">
            <div className="auth-brand-lockup">
              <span className="auth-brand-mark" aria-hidden="true">O</span>
              <span>OTHRU <small>PERSONAL FINANCE</small></span>
            </div>

            <div className="auth-brand-copy">
              <span className="eyebrow">YOUR MONEY, IN FOCUS</span>
              <h1>Make every shilling <em>count.</em></h1>
              <p>Understand your spending, stay on top of your budget, and make confident decisions with one clear view of your finances.</p>
            </div>

            <div className="auth-preview-card" aria-hidden="true">
              <div className="auth-preview-topline">
                <span>MONTHLY OVERVIEW</span>
                <span className="auth-preview-dot"></span>
              </div>
              <div className="auth-preview-balance">
                <small>Financial clarity starts here</small>
                <strong>Know where it goes.</strong>
              </div>
              <div className="auth-preview-bars">
                <span style={{ height: "35%" }}></span>
                <span style={{ height: "56%" }}></span>
                <span style={{ height: "43%" }}></span>
                <span style={{ height: "75%" }}></span>
                <span style={{ height: "60%" }}></span>
                <span style={{ height: "90%" }}></span>
                <span style={{ height: "67%" }}></span>
              </div>
              <div className="auth-preview-footer">
                <span><i className="auth-dot-green"></i> Intentional spending</span>
                <span>One step at a time</span>
              </div>
            </div>

            <div className="auth-brand-footnote">
              <span>PLAN SMARTER</span><span>SPEND MINDFULLY</span><span>BUILD YOUR FUTURE</span>
            </div>
          </section>

          <section className="panel login-panel auth-form-panel">
            <div className="auth-form-heading">
              <span className="auth-mobile-brand">OTHRU <small>PERSONAL FINANCE</small></span>
              <span className="auth-form-kicker">{authMode === "login" ? "YOUR FINANCES, READY WHEN YOU ARE" : "START YOUR FINANCIAL JOURNEY"}</span>
              <h2>{authMode === "login" ? "Welcome back" : "Create your account"}</h2>
              <p>{authMode === "login" ? "Sign in to see your financial picture clearly." : "Set up your account to start tracking your money."}</p>
            </div>

            {authMode === "login" ? (
              <form onSubmit={handleLogin}>
                <div className="form-group">
                  <label htmlFor="login-username">Username</label>
                  <input
                    id="login-username"
                    type="text"
                    autoComplete="username"
                    placeholder="Enter your username"
                    value={loginForm.username}
                    onChange={(event) => setLoginForm((previous) => ({ ...previous, username: event.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="login-password">Password</label>
                  <div className="password-input-wrap">
                    <input
                      id="login-password"
                      type={showLoginPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      value={loginForm.password}
                      onChange={(event) => setLoginForm((previous) => ({ ...previous, password: event.target.value }))}
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowLoginPassword((visible) => !visible)}
                      aria-label={showLoginPassword ? "Hide password" : "Show password"}
                      aria-pressed={showLoginPassword}
                    >{showLoginPassword ? "Hide" : "Show"}</button>
                  </div>
                </div>

                <button className="auth-submit-button" type="submit" disabled={authSubmitting}>
                  {authSubmitting ? <><span className="button-spinner" aria-hidden="true"></span> Signing in...</> : <>Sign in <span aria-hidden="true">→</span></>}
                </button>
                <div className="auth-divider">
  <span>OR</span>
</div>

<button
  type="button"
  className="auth-google-button"
  onClick={handleGoogleLogin}
  disabled={authSubmitting}
>
  <svg
    width="20"
    height="20"
    viewBox="0 0 48 48"
    aria-hidden="true"
  >
    <path
      fill="#4285F4"
      d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15z"
    />
    <path
      fill="#34A853"
      d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44z"
    />
    <path
      fill="#FBBC05"
      d="M12.6 27.7a12 12 0 0 1 0-7.4V15H5.8a20 20 0 0 0 0 18z"
    />
    <path
      fill="#EA4335"
      d="M24 12.1c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 6.1 29.5 4 24 4A20 20 0 0 0 5.8 15l6.8 5.3c1.6-4.8 6.1-8.2 11.4-8.2z"
    />
  </svg>

  <span>Continue with Google</span>
</button>

              </form>
            ) : (
              <form onSubmit={handleRegister}>
                <div className="form-group">
                  <label htmlFor="register-full-name">Full Name</label>
                  <input id="register-full-name" type="text" autoComplete="name" placeholder="Your full name" value={registerForm.full_name} onChange={(event) => setRegisterForm((previous) => ({ ...previous, full_name: event.target.value }))} required />
                </div>
                <div className="form-group">
                  <label htmlFor="register-username">Username</label>
                  <input id="register-username" type="text" autoComplete="username" placeholder="Choose a username" value={registerForm.username} onChange={(event) => setRegisterForm((previous) => ({ ...previous, username: event.target.value }))} required />
                </div>
                <div className="form-group">
  <label htmlFor="register-email">Email Address</label>
  <input
    id="register-email"
    type="email"
    autoComplete="email"
    placeholder="you@example.com"
    value={registerForm.email}
    onChange={(event) =>
      setRegisterForm((previous) => ({
        ...previous,
        email: event.target.value,
      }))
    }
    required
  />
</div>

<div className="form-group">
  <label htmlFor="register-confirm-email">
    Confirm Email Address
  </label>
  <input
    id="register-confirm-email"
    type="email"
    autoComplete="off"
    placeholder="Enter your email address again"
    value={registerForm.confirm_email}
    onChange={(event) =>
      setRegisterForm((previous) => ({
        ...previous,
        confirm_email: event.target.value,
      }))
    }
    required
  />
</div>
                <div className="form-group">
  <label htmlFor="register-password">Password</label>
  <div className="password-input-wrap">
    <input
      id="register-password"
      type={showRegisterPassword ? "text" : "password"}
      autoComplete="new-password"
      placeholder="Create a password"
      value={registerForm.password}
      onChange={(event) =>
        setRegisterForm((previous) => ({
          ...previous,
          password: event.target.value,
        }))
      }
      required
      minLength={8}
    />

    <button
      type="button"
      className="password-toggle"
      onClick={() => setShowRegisterPassword((visible) => !visible)}
      aria-label={showRegisterPassword ? "Hide password" : "Show password"}
      aria-pressed={showRegisterPassword}
    >
      {showRegisterPassword ? "Hide" : "Show"}
    </button>
  </div>
</div>

<div className="form-group">
  <label htmlFor="register-confirm-password">Confirm Password</label>
  <input
    id="register-confirm-password"
    type="password"
    autoComplete="new-password"
    placeholder="Enter your password again"
    value={registerForm.confirm_password}
    onChange={(event) =>
      setRegisterForm((previous) => ({
        ...previous,
        confirm_password: event.target.value,
      }))
    }
    required
    minLength={8}
  />
</div>
                <button className="auth-submit-button" type="submit" disabled={authSubmitting}>
                  {authSubmitting ? <><span className="button-spinner" aria-hidden="true"></span> Creating account...</> : <>Create account <span aria-hidden="true">→</span></>}
                </button>
              </form>
            )}

            {error && <p className="error-message auth-feedback" role="alert">{error}</p>}
            {message && <p className="success-message auth-feedback" role="status">{message}</p>}

            <div className="auth-switch">
              {authMode === "login" ? (
                <>New to OTHRU? <button type="button" className="auth-link-button" onClick={() => switchAuthMode("register")} disabled={authSubmitting}>Create an account</button></>
              ) : (
                <>Already have an account? <button type="button" className="auth-link-button" onClick={() => switchAuthMode("login")} disabled={authSubmitting}>Sign in</button></>
              )}
            </div>
            <div className="auth-security-note"><span aria-hidden="true">▣</span> Your financial information is for your account only.</div>
          </section>
        </div>
        <footer className="auth-page-footer">OTHRU PERSONAL FINANCE <span>•</span> TAKE CONTROL OF YOUR MONEY</footer>
      </div>
    );
  }

  // ================================================
  // MAIN DASHBOARD
  // ================================================

  return (
    <div className="app">
      <header className="app-header">
        <div className="dashboard-heading">
          <div className="dashboard-brand-label"><span className="dashboard-brand-mark">O</span> OTHRU <span>PERSONAL FINANCE</span></div>
          {activeTab === "home" && (
            <>
             <h1>
                {displayName
                  ? `Welcome back, ${displayName}`
                  : "Your Personal Finance Dashboard"}
              </h1>
              <p>
                Track, manage and understand your money — your financial overview at a glance.
              </p>
            </>
        )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div className="month-selector">
            <label htmlFor="selectedMonth">Dashboard Month</label>

            <input
              id="selectedMonth"
              type="month"
              value={selectedMonth}
              onChange={(event) => {
                if (event.target.value) {
                  setSelectedMonth(event.target.value);
                }
              }}
            />
          </div>

          <button
            type="button"
            onClick={deleteAccount}
            style={{
              padding: "10px 16px",
              border: "1px solid #dc2626",
              borderRadius: "8px",
              backgroundColor: "#ffffff",
              color: "#dc2626",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            Delete Account
          </button>

          <button
            type="button"
            onClick={logout}
            style={{
              padding: "10px 16px",
              border: "none",
              borderRadius: "8px",
              backgroundColor: "#111827",
              color: "#ffffff",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      </header>

      {message && (
        <div className="success-message" role="status">
          {message}
        </div>
      )}

      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      {loading && <div className="loading">Loading dashboard...</div>}

      {!loading && (
        <>
          {/* MONTHLY OVERVIEW */}

          <section className="panel monthly-overview" hidden={activeTab !== "home"}>
            <div className="panel-header">
              <div>
                <h2>{selectedMonthLabel} Overview</h2>
                <p>
                  A summary of your income, expenditure and daily spending
                  pattern.
                </p>
              </div>
            </div>

            <div className="dashboard-quick-actions" aria-label="Quick actions">
              <button type="button" className="quick-action quick-action-primary" onClick={() => { setActiveTab("transactions"); setExpandedForm("expense"); setEditingExpenseId(null); setExpenseForm(emptyExpenseForm()); clearMessages(); }}>
                <span className="quick-action-icon" aria-hidden="true">＋</span><span><strong>Add expense</strong><small>Record money spent</small></span>
              </button>
              <button type="button" className="quick-action" onClick={() => { setActiveTab("transactions"); setExpandedForm("income"); setEditingIncomeId(null); setIncomeForm(emptyIncomeForm()); clearMessages(); }}>
                <span className="quick-action-icon" aria-hidden="true">↗</span><span><strong>Add income</strong><small>Record money received</small></span>
              </button>
              <button type="button" className="quick-action" onClick={() => { setActiveTab("more"); setExpandedForm(null); clearMessages(); }}>
                <span className="quick-action-icon" aria-hidden="true">•••</span><span><strong>Import M-Pesa</strong><small>Parse and review records</small></span>
              </button>
            </div>

            <div className="summary-grid">
              <div className="summary-card">
                <span>Total Income</span>
                <strong>{formatMoney(totalIncome)}</strong>
              </div>

              <div className="summary-card">
                <span>Total Spending</span>
                <strong>{formatMoney(totalExpenses)}</strong>
              </div>

              <div className="summary-card">
                <span>Monthly Budget</span>
                <strong>{formatMoney(budgetTotal)}</strong>
              </div>

              <div className="summary-card">
                <span>Budget Remaining</span>
                <strong>{formatMoney(budgetRemaining)}</strong>
              </div>

              <div className="summary-card">
                <span>Net Cash Flow</span>
                <strong>{formatMoney(cashRemaining)}</strong>
              </div>

              <div className="summary-card">
                <span>Savings Rate</span>
                <strong>{formatPercent(savingsRate)}</strong>
              </div>

              <div className="summary-card">
                <span>Average Daily Spending</span>
                <strong>{formatMoney(averageDailySpending)}</strong>
              </div>

              <div className="summary-card">
                <span>Average on Spending Days</span>
                <strong>{formatMoney(averageSpendingOnRecordedDays)}</strong>
              </div>

              <div className="summary-card">
                <span>Days with Spending</span>
                <strong>
                  {daysWithSpending} / {daysInSelectedMonth}
                </strong>
              </div>

              <div className="summary-card">
                <span>Highest Spending Day</span>
                <strong>
                  {highestSpendingDay.day > 0
                    ? `${highestSpendingDay.day} — ${formatMoney(
                        highestSpendingDay.amount
                      )}`
                    : "No spending yet"}
                </strong>
              </div>

              <div className="summary-card">
                <span>Projected Month-End Spending</span>
                <strong>{formatMoney(projectedSpending)}</strong>
              </div>

              <div className="summary-card">
                <span>Financial Health</span>
                <strong>{financialHealth}</strong>
              </div>
            </div>
          </section>

          {/* MONTHLY SPENDING WITH ITS OWN MONTH DROPDOWN */}

          <section className="panel daily-monthly-panel" hidden={activeTab !== "insights"}>
            <div
              className="panel-header"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "16px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2>Monthly Spending</h2>
                <p>
                  Review daily expenses for any month without changing the
                  month selected for the rest of your dashboard.
                </p>
              </div>

              <div
                className="month-selector"
                style={{
                  minWidth: "190px",
                  maxWidth: "100%",
                }}
              >
                <label htmlFor="monthlySpendingMonth">
                  Select Spending Month
                </label>

                <select
                  id="monthlySpendingMonth"
                  value={monthlySpendingMonth}
                  onChange={(event) =>
                    setMonthlySpendingMonth(event.target.value)
                  }
                  style={{
                    width: "100%",
                    minWidth: "0",
                    padding: "10px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: "8px",
                    fontSize: "14px",
                    backgroundColor: "#ffffff",
                    color: "#111827",
                  }}
                >
                  {monthlySpendingMonthOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="daily-chart-summary">
              <div>
                <span>Total spending</span>
                <strong>{formatMoney(monthlyChartTotal)}</strong>
              </div>

              <div>
                <span>Average per calendar day</span>
                <strong>
                  {formatMoney(monthlyChartAverageDailySpending)}
                </strong>
              </div>

              <div>
                <span>Days with spending</span>
                <strong>
                  {monthlyChartDaysWithSpending} /{" "}
                  {daysInMonthlyChartMonth}
                </strong>
              </div>

              <div>
                <span>Highest daily spending</span>
                <strong>
                  {monthlyChartHighestSpendingDay.day > 0
                    ? `${monthlyChartHighestSpendingDay.day} — ${formatMoney(
                        monthlyChartHighestSpendingDay.amount
                      )}`
                    : "No spending yet"}
                </strong>
              </div>
            </div>

            {monthlyChartTotal === 0 ? (
              <div className="empty-state">
                <p>
                  No expenses recorded for {monthlyChartLabel}.
                </p>
                <p>
                  Select another month above or add expenses to populate
                  this chart.
                </p>
              </div>
            ) : (
              <div
                className="daily-chart-monthly"
                style={{
                  display: "flex",
                  alignItems: "stretch",
                  gap: "5px",
                  overflowX: "auto",
                  padding: "20px 6px 8px",
                  minHeight: "260px",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                {monthlyChartDailySpending.map((day) => {
                  const hasSpending = day.amount > 0;

                  const isHighest =
                    hasSpending &&
                    day.amount ===
                      monthlyChartHighestSpendingDay.amount;

                  const barHeight = hasSpending
                    ? Math.max(
                        4,
                        (day.amount / monthlyChartMaxDailySpending) * 140
                      )
                    : 0;

                  return (
                    <div
                      className={`daily-column ${
                        isHighest ? "daily-column-peak" : ""
                      } ${
                        hasSpending ? "has-spending" : "no-spending"
                      }`}
                      key={day.date}
                      title={`${day.date}: ${formatMoney(day.amount)}`}
                      style={{
                        flex: "1 0 34px",
                        minWidth: "34px",
                        maxWidth: "64px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-end",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <span
                        className="daily-bar-value"
                        style={{
                          fontSize: "10px",
                          lineHeight: 1.2,
                          textAlign: "center",
                          overflowWrap: "anywhere",
                          minHeight: "24px",
                          display: "flex",
                          alignItems: "flex-end",
                          justifyContent: "center",
                          visibility: hasSpending ? "visible" : "hidden",
                        }}
                      >
                        {day.amount.toLocaleString("en-KE", {
                          maximumFractionDigits: 0,
                        })}
                      </span>

                      <div
                        className="daily-bar-track"
                        style={{
                          height: "145px",
                          width: "100%",
                          display: "flex",
                          alignItems: "flex-end",
                          justifyContent: "center",
                          backgroundColor: "transparent",
                        }}
                      >
                        <div
                          className={`daily-bar ${
                            isHighest ? "daily-bar-peak" : ""
                          }`}
                          style={{
                            width: "70%",
                            height: `${barHeight}px`,
                            minHeight: hasSpending ? "4px" : "0",
                            borderRadius: "5px 5px 0 0",
                            backgroundColor: isHighest
                              ? "#dc2626"
                              : hasSpending
                                ? "#2563eb"
                                : "#e5e7eb",
                            transition: "height 0.2s ease",
                          }}
                        />
                      </div>

                      <span
                        className="daily-day-label"
                        style={{
                          fontSize: "11px",
                          fontWeight: isHighest ? 700 : 400,
                        }}
                      >
                        {day.day}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div
              className="daily-chart-legend"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "14px",
                marginTop: "14px",
                fontSize: "12px",
              }}
            >
              <span>
                <span
                  className="legend-dot legend-dot-normal"
                  style={{
                    display: "inline-block",
                    width: "9px",
                    height: "9px",
                    borderRadius: "50%",
                    backgroundColor: "#2563eb",
                    marginRight: "6px",
                  }}
                />
                Spending recorded
              </span>

              <span>
                <span
                  className="legend-dot legend-dot-zero"
                  style={{
                    display: "inline-block",
                    width: "9px",
                    height: "9px",
                    borderRadius: "50%",
                    backgroundColor: "#e5e7eb",
                    marginRight: "6px",
                  }}
                />
                No spending
              </span>

              <span>
                <span
                  className="legend-dot legend-dot-peak"
                  style={{
                    display: "inline-block",
                    width: "9px",
                    height: "9px",
                    borderRadius: "50%",
                    backgroundColor: "#dc2626",
                    marginRight: "6px",
                  }}
                />
                Highest spending day
              </span>
            </div>

            <p style={{ fontSize: "12px", opacity: 0.7, marginTop: "12px" }}>
              Amounts above the bars are in KES. Hover over a bar to see
              the exact date and amount. Days without expenses remain
              visible with zero-height bars.
            </p>
          </section>

          {/* EXPENSE AND INCOME FORMS */}

          <section className="forms-grid" hidden={activeTab !== "transactions"}>
            <div className={`panel form-accordion ${expandedForm === "expense" ? "is-expanded" : ""}`}>
              <button
                type="button"
                className="form-accordion-trigger"
                aria-expanded={expandedForm === "expense"}
                onClick={() => setExpandedForm((current) => current === "expense" ? null : "expense")}
              >
                <span className="form-accordion-heading">
                  <span className="form-accordion-icon" aria-hidden="true">{expandedForm === "expense" ? "−" : "+"}</span>
                  <span>
                    <strong>{editingExpenseId ? "Edit Expense" : "Add Expense"}</strong>
                    <small>Record your spending for {selectedMonthLabel}.</small>
                  </span>
                </span>
                <span className="form-accordion-chevron" aria-hidden="true">
                  {expandedForm === "expense" ? "−" : "+"}
                </span>
              </button>

              {expandedForm === "expense" && (
              <form onSubmit={saveExpense} className="form-grid form-accordion-content">
                <label>
                  Date
                  <input
                    type="date"
                    name="transaction_date"
                    value={expenseForm.transaction_date}
                    onChange={handleExpenseChange}
                    required
                  />
                </label>

                <label>
                  Amount
                  <input
                    type="number"
                    name="amount"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={expenseForm.amount}
                    onChange={handleExpenseChange}
                    required
                  />
                </label>

                <label>
                  Category
                  <select
                    name="category_id"
                    value={expenseForm.category_id}
                    onChange={handleExpenseChange}
                    required
                  >
                    <option value="">Select category</option>

                    {expenseCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Description
                  <input
                    type="text"
                    name="description"
                    placeholder="What was this for?"
                    value={expenseForm.description}
                    onChange={handleExpenseChange}
                  />
                </label>

                <label className="full-width">
                  Notes
                  <textarea
                    name="notes"
                    placeholder="Optional notes"
                    value={expenseForm.notes}
                    onChange={handleExpenseChange}
                  />
                </label>

                <div className="form-actions full-width">
                  <button type="submit">
                    {editingExpenseId ? "Update Expense" : "Add Expense"}
                  </button>

                  {editingExpenseId && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setEditingExpenseId(null);
                        setExpenseForm(emptyExpenseForm());
                        setExpandedForm(null);
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
              )}
            </div>

            <div className={`panel form-accordion ${expandedForm === "income" ? "is-expanded" : ""}`}>
              <button
                type="button"
                className="form-accordion-trigger"
                aria-expanded={expandedForm === "income"}
                onClick={() => setExpandedForm((current) => current === "income" ? null : "income")}
              >
                <span className="form-accordion-heading">
                  <span className="form-accordion-icon" aria-hidden="true">＋</span>
                  <span>
                    <strong>{editingIncomeId ? "Edit Income" : "Add Income"}</strong>
                    <small>Record money received during the month.</small>
                  </span>
                </span>
                <span className="form-accordion-chevron" aria-hidden="true">
                  {expandedForm === "income" ? "−" : "+"}
                </span>
              </button>

              {expandedForm === "income" && (
              <form onSubmit={saveIncome} className="form-grid form-accordion-content">
                <label>
                  Date
                  <input
                    type="date"
                    name="income_date"
                    value={incomeForm.income_date}
                    onChange={handleIncomeChange}
                    required
                  />
                </label>

                <label>
                  Amount
                  <input
                    type="number"
                    name="amount"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={incomeForm.amount}
                    onChange={handleIncomeChange}
                    required
                  />
                </label>

                <label>
                  Source
                  <input
                    type="text"
                    name="source"
                    placeholder="Salary, freelance, business..."
                    value={incomeForm.source}
                    onChange={handleIncomeChange}
                    required
                  />
                </label>

                <label>
                  Description
                  <input
                    type="text"
                    name="description"
                    placeholder="Optional description"
                    value={incomeForm.description}
                    onChange={handleIncomeChange}
                  />
                </label>

                <label className="full-width">
                  Notes
                  <textarea
                    name="notes"
                    placeholder="Optional notes"
                    value={incomeForm.notes}
                    onChange={handleIncomeChange}
                  />
                </label>

                <div className="form-actions full-width">
                  <button type="submit">
                    {editingIncomeId ? "Update Income" : "Add Income"}
                  </button>

                  {editingIncomeId && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setEditingIncomeId(null);
                        setIncomeForm(emptyIncomeForm());
                        setExpandedForm(null);
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
              )}
            </div>
          </section>

                    {/* PROFILE / ABOUT ME */}

          <section className="panel profile-page" hidden={activeTab !== "profile"}>
            <div className="panel-header">
              <div>
                <h2>My Profile</h2>
                <p>Manage and review your OTHRU account information.</p>
              </div>
            </div>

            <div className="profile-card">
              <div className="profile-avatar" aria-hidden="true">
                {(profile?.full_name || displayName || "U")
                  .trim()
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <div className="profile-identity">
                <h3>{profile?.full_name || displayName || "User"}</h3>
                <p>@{profile?.username || "Username unavailable"}</p>
              </div>
            </div>

            <div className="profile-details">
              <div className="profile-detail-item">
                <span>Full name</span>
                <strong>{profile?.full_name || "Not available"}</strong>
              </div>

              <div className="profile-detail-item">
                <span>Username</span>
                <strong>{profile?.username || "Not available"}</strong>
              </div>

              <div className="profile-detail-item">
                <span>Email address</span>
                <strong>{profile?.email || "Not available"}</strong>
              </div>

              <div className="profile-detail-item">
                <span>Email verification</span>
                <strong>
                  {profile
                    ? profile.email_verified
                      ? "Verified"
                      : "Not verified"
                    : "Loading..."}
                </strong>
              </div>

              <div className="profile-detail-item">
                <span>Account status</span>
                <strong>
                  {profile
                    ? profile.is_active
                      ? "Active"
                      : "Inactive"
                    : "Loading..."}
                </strong>
              </div>

              <div className="profile-detail-item">
                <span>Sign-in method</span>
                <strong>
                  {profile?.auth_provider
                    ? profile.auth_provider === "google"
                      ? "Google"
                      : "Email and password"
                    : "Not available"}
                </strong>
              </div>
            </div>

            <div className="profile-about">
              <h3>About OTHRU</h3>
              <p>
                OTHRU Personal Finance helps you track income, manage expenses,
                monitor budgets, build savings, and understand your financial
                health.
              </p>
            </div>
          </section>

          {/* M-PESA SMS IMPORT */}


          <section className="mpesa-import-page" hidden={activeTab !== "more"}>
          <MpesaImport
            categories={categories}
            authHeaders={authHeaders}
            onSaved={fetchData}
            showMessage={showMessage}
            showError={showError}
          />
          </section>

          {/* FINANCIAL INTELLIGENCE */}

          <section className="panel" hidden={activeTab !== "insights"}>
            <div className="panel-header">
              <div>
                <h2>Financial Intelligence</h2>

                <p>
                  A forward-looking view of your finances for{" "}
                  {selectedMonthLabel}.
                </p>
              </div>
            </div>

            <div className="summary-grid">
              <div className="summary-card">
                <span>Financial Health</span>
                <strong>{financialHealth}</strong>
              </div>

              <div className="summary-card">
                <span>Spending Pace</span>
                <strong>{spendingPace}</strong>
              </div>

              <div className="summary-card">
                <span>Projected Month-End Spending</span>
                <strong>{formatMoney(projectedSpending)}</strong>
              </div>

              <div className="summary-card">
                <span>Projected Month-End Cash</span>
                <strong>{formatMoney(projectedCash)}</strong>
              </div>

              <div className="summary-card">
                <span>Expected Budget Used</span>
                <strong>{formatPercent(expectedBudgetUsed)}</strong>
              </div>

              <div className="summary-card">
                <span>Actual Budget Used</span>
                <strong>{formatPercent(actualBudgetUsed)}</strong>
              </div>
            </div>

            <div
              style={{
                marginTop: "18px",
                padding: "14px 16px",
                borderRadius: "10px",
                background: "#f8fafc",
                display: "flex",
                justifyContent: "space-between",
                gap: "16px",
                flexWrap: "wrap",
              }}
            >
              <span>Spending pace difference</span>
              <strong>{formatPercent(spendingPaceDifference)}</strong>
            </div>
          </section>

          {/* BUDGET MANAGEMENT */}

          <section className="panel" hidden={activeTab !== "budgets"}>
            <div className="panel-header">
              <div>
                <h2>Budget Management</h2>

                <p>
                  Set or adjust the monthly spending limit for each expense
                  category.
                </p>
              </div>

              <div style={{ fontWeight: 700 }}>
                Saved Budget: {formatMoney(savedBudgetTotal)}
              </div>
            </div>

            <div style={{ overflowX: "auto", marginTop: "16px" }}>
              <table className="budget-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Monthly Budget</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {expenseCategories.map((category) => {
                    const existingBudget = budgets.find(
                      (budget) =>
                        Number(budget.category_id) === Number(category.id)
                    );

                    return (
                      <tr key={category.id}>
                        <td>
                          <strong>{category.name}</strong>
                        </td>

                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={budgetInputs[category.id] ?? ""}
                            onChange={(event) =>
                              handleBudgetChange(
                                category.id,
                                event.target.value
                              )
                            }
                            style={{
                              width: "160px",
                              maxWidth: "100%",
                              padding: "9px 10px",
                              border: "1px solid #d1d5db",
                              borderRadius: "8px",
                            }}
                          />
                        </td>

                        <td>
                          <div
                            style={{
                              display: "flex",
                              gap: "8px",
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              type="button"
                              className="small-button"
                              onClick={() => saveBudget(category.id)}
                            >
                              Save
                            </button>

                            {existingBudget && (
                              <button
                                type="button"
                                className="small-button danger-button"
                                onClick={() => deleteBudget(category.id)}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* BUDGET VS ACTUAL */}

          <section className="panel" hidden={activeTab !== "budgets"}>
            <div className="panel-header">
              <div>
                <h2>Budget vs Actual</h2>

                <p>
                  Compare your planned spending with actual spending.
                </p>
              </div>
            </div>

            <div className="budget-table-wrapper">
              <table className="budget-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Budget</th>
                    <th>Actual</th>
                    <th>Remaining</th>
                    <th>Used</th>
                  </tr>
                </thead>

                <tbody>
                  {(analytics?.budget_vs_actual || []).map((item) => (
                    <tr key={item.category_id}>
                      <td>{item.category}</td>
                      <td>{formatMoney(item.budget)}</td>
                      <td>{formatMoney(item.spent)}</td>
                      <td>{formatMoney(item.remaining)}</td>

                      <td>
                        <div className="progress-cell">
                          <div className="progress-track">
                            <div
                              className="progress-fill"
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.max(
                                    0,
                                    Number(item.percentage_used || 0)
                                  )
                                )}%`,
                              }}
                            />
                          </div>

                          <span>
                            {formatPercent(item.percentage_used)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {(analytics?.budget_vs_actual || []).length === 0 && (
                    <tr>
                      <td colSpan="5">
                        No budget comparison data available for this month.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* CATEGORY ALERTS */}

          <section className="panel" hidden={activeTab !== "budgets"}>
            <div className="panel-header">
              <div>
                <h2>Category Alerts</h2>
                <p>Current status of each spending category.</p>
              </div>
            </div>

            <div className="budget-table-wrapper">
              <table className="budget-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Budget</th>
                    <th>Spent</th>
                    <th>Used</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {(analytics?.category_warnings || []).map((warning) => (
                    <tr key={warning.category}>
                      <td>{warning.category}</td>
                      <td>{formatMoney(warning.budget)}</td>
                      <td>{formatMoney(warning.spent)}</td>
                      <td>{formatPercent(warning.percentage_used)}</td>
                      <td>
                        <strong>{warning.status}</strong>
                      </td>
                    </tr>
                  ))}

                  {(analytics?.category_warnings || []).length === 0 && (
                    <tr>
                      <td colSpan="5">
                        No category alerts available for this month.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
                    {/* SAVINGS GOALS */}

          <section className="panel" hidden={activeTab !== "savings"}>
            <div className="panel-header">
              <div>
                <h2>My Savings</h2>
                <p>
                  Set financial goals, track your progress, and record
                  contributions.
                </p>
              </div>
            </div>

            <div className="summary-grid">
              <div className="summary-card">
                <span>Savings Goals</span>
                <strong>{savingsGoals.length}</strong>
              </div>

              <div className="summary-card">
                <span>Total Target</span>
                <strong>
                  {formatMoney(
                    savingsGoals.reduce(
                      (total, goal) =>
                        total + Number(goal.target_amount || 0),
                      0
                    )
                  )}
                </strong>
              </div>

              <div className="summary-card">
                <span>Total Saved</span>
                <strong>
                  {formatMoney(
                    savingsGoals.reduce(
                      (total, goal) =>
                        total + Number(
                          goal.total_saved ??
                          goal.saved_amount ??
                          goal.current_amount ??
                          0
                        ),
                      0
                    )
                  )}
                </strong>
              </div>
            </div>
          </section>

          {/* CREATE OR EDIT SAVINGS GOAL */}

          <section className="panel" hidden={activeTab !== "savings"}>
            <div className="panel-header">
              <div>
                <h2>
                  {editingSavingsGoalId
                    ? "Edit Savings Goal"
                    : "Create a Savings Goal"}
                </h2>

                <p>
                  Define what you are saving for and how much you need.
                </p>
              </div>
            </div>

            <form onSubmit={saveSavingsGoal}>
              <div className="transaction-filter-grid">
                <label>
                  Goal Name
                  <input
                    type="text"
                    value={savingsGoalForm.name}
                    onChange={(event) =>
                      setSavingsGoalForm((previous) => ({
                        ...previous,
                        name: event.target.value,
                      }))
                    }
                    placeholder="e.g. Emergency Fund"
                    required
                  />
                </label>

                <label>
                  Target Amount (KES)
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={savingsGoalForm.target_amount}
                    onChange={(event) =>
                      setSavingsGoalForm((previous) => ({
                        ...previous,
                        target_amount: event.target.value,
                      }))
                    }
                    placeholder="e.g. 100000"
                    required
                  />
                </label>

                <label>
                  Target Date
                  <input
                    type="date"
                    value={savingsGoalForm.target_date}
                    onChange={(event) =>
                      setSavingsGoalForm((previous) => ({
                        ...previous,
                        target_date: event.target.value,
                      }))
                    }
                  />
                </label>

                <label>
                  Description
                  <input
                    type="text"
                    value={savingsGoalForm.description}
                    onChange={(event) =>
                      setSavingsGoalForm((previous) => ({
                        ...previous,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Optional notes about this goal"
                  />
                </label>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  flexWrap: "wrap",
                  marginTop: "16px",
                }}
              >
                <button
                  type="submit"
                  className="primary-button"
                  disabled={savingsLoading}
                >
                  {savingsLoading
                    ? "Please wait..."
                    : editingSavingsGoalId
                      ? "Update Goal"
                      : "Create Goal"}
                </button>

                {editingSavingsGoalId && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={cancelEditingSavingsGoal}
                    disabled={savingsLoading}
                  >
                    Cancel Editing
                  </button>
                )}
              </div>
            </form>
          </section>

          {/* SAVINGS GOALS LIST */}

          <section className="panel" hidden={activeTab !== "savings"}>
            <div className="panel-header">
              <div>
                <h2>Your Goals</h2>
                <p>Monitor progress and manage each savings goal.</p>
              </div>
            </div>

            {savingsGoals.length === 0 ? (
              <p className="empty-state">
                You have not created any savings goals yet. Use the form
                above to create your first goal.
              </p>
            ) : (
              <div className="transaction-list">
                {savingsGoals.map((goal) => {
                  const target = Number(goal.target_amount || 0);

                  const saved = Number(
                    goal.total_saved ??
                    goal.saved_amount ??
                    goal.current_amount ??
                    0
                  );

                  const progress =
                    target > 0
                      ? Math.min(100, Math.max(0, (saved / target) * 100))
                      : 0;

                  return (
                    <div className="transaction-row" key={goal.id}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong>{goal.name}</strong>

                        {goal.description && (
                          <span>{goal.description}</span>
                        )}

                        <span>
                          Target: {formatMoney(target)}
                        </span>

                        <span>
                          Saved: {formatMoney(saved)}
                        </span>

                        <span>
                          Remaining: {formatMoney(Math.max(0, target - saved))}
                        </span>

                        {goal.target_date && (
                          <small>
                            Target date: {String(goal.target_date).slice(0, 10)}
                          </small>
                        )}

                        <div
                          className="progress-track"
                          style={{ marginTop: "10px", maxWidth: "420px" }}
                        >
                          <div
                            className="progress-fill"
                            style={{ width: `${progress}%` }}
                          />
                        </div>

                        <small>
                          {progress.toFixed(1)}% of target reached
                        </small>
                      </div>

                      <div
                        className="transaction-actions"
                        style={{ flexWrap: "wrap" }}
                      >
                        <button
                          type="button"
                          className="small-button"
                          onClick={() => loadSavingsContributions(goal.id)}
                          disabled={savingsLoading}
                        >
                          Contributions
                        </button>

                        <button
                          type="button"
                          className="small-button"
                          onClick={() => startEditingSavingsGoal(goal)}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="small-button danger-button"
                          onClick={() => deleteSavingsGoal(goal)}
                          disabled={savingsLoading}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* SAVINGS CONTRIBUTIONS */}

          <section className="panel" hidden={activeTab !== "savings"}>
            <div className="panel-header">
              <div>
                <h2>Record a Contribution</h2>
                <p>Add money saved toward a selected goal.</p>
              </div>
            </div>

            {savingsGoals.length === 0 ? (
              <p className="empty-state">
                Create a savings goal before recording contributions.
              </p>
            ) : (
              <form onSubmit={saveSavingsContribution}>
                <div className="transaction-filter-grid">
                  <label>
                    Savings Goal
                    <select
                      value={selectedSavingsGoal ?? ""}
                      onChange={(event) => {
                        const goalId = event.target.value;

                        if (goalId) {
                          loadSavingsContributions(Number(goalId));
                        } else {
                          setSelectedSavingsGoal(null);
                          setSavingsContributions([]);
                        }
                      }}
                      required
                    >
                      <option value="">Select a goal</option>

                      {savingsGoals.map((goal) => (
                        <option key={goal.id} value={goal.id}>
                          {goal.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Contribution Amount (KES)
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={savingsContributionForm.amount}
                      onChange={(event) =>
                        setSavingsContributionForm((previous) => ({
                          ...previous,
                          amount: event.target.value,
                        }))
                      }
                      placeholder="e.g. 2000"
                      required
                    />
                  </label>

                  <label>
                    Contribution Date
                    <input
                      type="date"
                      value={savingsContributionForm.contribution_date}
                      onChange={(event) =>
                        setSavingsContributionForm((previous) => ({
                          ...previous,
                          contribution_date: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>

                  <label>
                    Notes
                    <input
                      type="text"
                      value={savingsContributionForm.notes}
                      onChange={(event) =>
                        setSavingsContributionForm((previous) => ({
                          ...previous,
                          notes: event.target.value,
                        }))
                      }
                      placeholder="Optional contribution notes"
                    />
                  </label>
                </div>

                <div style={{ marginTop: "16px" }}>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={savingsLoading || !selectedSavingsGoal}
                  >
                    {savingsLoading
                      ? "Please wait..."
                      : "Record Contribution"}
                  </button>
                </div>
              </form>
            )}
          </section>

          {/* SAVINGS CONTRIBUTION HISTORY */}

          <section className="panel" hidden={activeTab !== "savings"}>
            <div className="panel-header">
              <div>
                <h2>Contribution History</h2>
                <p>Recorded contributions for the selected savings goal.</p>
              </div>
            </div>

            {!selectedSavingsGoal ? (
              <p className="empty-state">
                Select a goal and click Contributions to view its history.
              </p>
            ) : savingsContributions.length === 0 ? (
              <p className="empty-state">
                No contributions have been recorded for this goal yet.
              </p>
            ) : (
              <div className="budget-table-wrapper">
                <table className="budget-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Notes</th>
                    </tr>
                  </thead>

                  <tbody>
                    {savingsContributions.map((contribution) => (
                      <tr key={contribution.id}>
                        <td>
                          {String(
                            contribution.contribution_date || ""
                          ).slice(0, 10)}
                        </td>

                        <td>
                          {formatMoney(contribution.amount)}
                        </td>

                        <td>
                          {contribution.notes || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* SPENDING ANALYTICS */}

          <section className="analytics-grid" hidden={activeTab !== "insights"}>
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Spending by Category</h2>
                  <p>Where your money is going.</p>
                </div>
              </div>

              <div className="category-chart">
                {categorySpending.length === 0 && (
                  <p className="empty-state">No spending recorded yet.</p>
                )}

                {categorySpending.map((item) => (
                  <div className="category-row" key={item.category_id}>
                    <div className="category-row-label">
                      <span>{item.category}</span>
                      <strong>{formatMoney(item.amount)}</strong>
                    </div>

                    <div className="category-bar-track">
                      <div
                        className="category-bar"
                        style={{
                          width: `${
                            (Number(item.amount || 0) /
                              maxCategorySpending) *
                            100
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Daily Spending Details</h2>
                  <p>
                    Daily totals for {selectedMonthLabel}, based on recorded
                    expenses.
                  </p>
                </div>
              </div>

              <div className="daily-detail-list">
                {dailySpending.filter((day) => day.amount > 0).length === 0 ? (
                  <p className="empty-state">
                    No daily expenses to display.
                  </p>
                ) : (
                  dailySpending
                    .filter((day) => day.amount > 0)
                    .slice()
                    .sort((a, b) => b.amount - a.amount)
                    .map((day) => (
                      <div className="daily-detail-row" key={day.date}>
                        <div>
                          <strong>{day.date}</strong>

                          {day.day === highestSpendingDay.day && (
                            <span className="peak-day-badge">Highest</span>
                          )}
                        </div>

                        <strong>{formatMoney(day.amount)}</strong>
                      </div>
                    ))
                )}
              </div>
            </div>
          </section>

          {/* ADDITIONAL ILLUSTRATIVE CHARTS */}

          <section className="analytics-grid expanded-analytics-grid" hidden={activeTab !== "insights"}>
            <div className="panel chart-panel">
              <div className="panel-header">
                <div><h2>Six-month cash-flow trend</h2><p>Income, expenses and net cash flow from records currently loaded in OTHRU.</p></div>
              </div>
              <div className="trend-chart" role="img" aria-label="Six-month income and expenses bar chart">
                {monthlyTrendData.map((item) => {
                  const maxValue = Math.max(1, ...monthlyTrendData.flatMap((month) => [month.income, month.expenses]));
                  return <div className="trend-month" key={item.key}>
                    <div className="trend-bars">
                      <div className="trend-bar income-bar" style={{ height: `${Math.max(item.income > 0 ? 4 : 0, item.income / maxValue * 100)}%` }} title={`Income: ${formatMoney(item.income)}`} />
                      <div className="trend-bar expense-bar" style={{ height: `${Math.max(item.expenses > 0 ? 4 : 0, item.expenses / maxValue * 100)}%` }} title={`Expenses: ${formatMoney(item.expenses)}`} />
                    </div>
                    <span>{item.label}</span>
                    <small>{item.net >= 0 ? "+" : "−"}{formatMoney(Math.abs(item.net))}</small>
                  </div>;
                })}
              </div>
              <div className="chart-legend"><span><i className="legend-income" /> Income</span><span><i className="legend-expense" /> Expenses</span></div>
            </div>

            <div className="panel chart-panel">
              <div className="panel-header"><div><h2>Expense mix</h2><p>Share of recorded expenditure by category for {selectedMonthLabel}.</p></div></div>
              {categorySpending.length ? <div className="donut-layout">
                <div className="donut-chart" style={{ background: `conic-gradient(${categorySpending.reduce((acc, item, index) => { const total = categorySpending.reduce((sum, entry) => sum + Number(entry.amount || 0), 0) || 1; const start = acc.end; const end = start + Number(item.amount || 0) / total * 100; acc.parts.push(`${["#12a594", "#557ce7", "#8a6be8", "#e8a23b", "#df5267", "#3f9bda", "#6eaf79", "#b07d62"][index % 8]} ${start}% ${end}%`); acc.end = end; return acc; }, { parts: [], end: 0 }).parts.join(", ")})` }}><div><strong>{formatMoney(totalExpenses)}</strong><span>Total spending</span></div></div>
                <div className="donut-legend">{categorySpending.map((item, index) => <div key={item.category_id}><i style={{ background: ["#12a594", "#557ce7", "#8a6be8", "#e8a23b", "#df5267", "#3f9bda", "#6eaf79", "#b07d62"][index % 8] }} /><span>{item.category}</span><strong>{formatPercent(totalExpenses > 0 ? Number(item.amount || 0) / totalExpenses * 100 : 0)}</strong></div>)}</div>
              </div> : <p className="empty-state">Record expenses to see the category mix.</p>}
            </div>

            <div className="panel chart-panel">
              <div className="panel-header"><div><h2>Budget vs actual by category</h2><p>Compare the planned budget with actual spending for {selectedMonthLabel}.</p></div></div>
              {budgetActualData.length ? <div className="comparison-chart">{budgetActualData.map((item) => { const max = Math.max(1, ...budgetActualData.flatMap((entry) => [entry.budget, entry.spent])); return <div className="comparison-row" key={item.category}><div className="comparison-label"><span>{item.category}</span><small>Budget {formatMoney(item.budget)} · Spent {formatMoney(item.spent)}</small></div><div className="comparison-pair"><div className="comparison-track" title={`Budget: ${formatMoney(item.budget)}`}><span className="comparison-budget" style={{ width: `${item.budget / max * 100}%` }} /></div><div className="comparison-track" title={`Actual: ${formatMoney(item.spent)}`}><span className="comparison-spent" style={{ width: `${item.spent / max * 100}%` }} /></div></div></div>; })}<div className="chart-legend"><span><i className="legend-budget" /> Budget</span><span><i className="legend-expense" /> Actual spending</span></div></div> : <p className="empty-state">Set a budget or record spending to compare performance.</p>}
            </div>

            <div className="panel chart-panel">
              <div className="panel-header"><div><h2>Income by source</h2><p>Where recorded income came from during {selectedMonthLabel}.</p></div></div>
              {incomeSourceData.length ? <div className="category-chart">{incomeSourceData.map((item) => { const max = Math.max(1, ...incomeSourceData.map((entry) => entry.amount)); return <div className="category-row" key={item.source}><div className="category-row-label"><span>{item.source}</span><strong>{formatMoney(item.amount)}</strong></div><div className="category-bar-track"><div className="income-source-bar" style={{ width: `${item.amount / max * 100}%` }} /></div></div>; })}</div> : <p className="empty-state">Add income records with a source to see this chart.</p>}
            </div>
          </section>

          {/* FINANCIAL HEALTH FLOW */}

          <section className="panel" hidden={activeTab !== "insights"}>
            <div className="panel-header">
              <div>
                <h2>Financial Health Flow</h2>

                <p>How income moves through your monthly finances.</p>
              </div>
            </div>

            <div className="financial-flow">
              <div className="flow-box">
                <span>Income</span>
                <strong>{formatMoney(totalIncome)}</strong>
              </div>

              <div className="flow-connector" />

              <div className="flow-box">
                <span>Spending</span>
                <strong>{formatMoney(totalExpenses)}</strong>
              </div>

              <div className="flow-connector" />

              <div className="flow-box">
                <span>Remaining</span>
                <strong>{formatMoney(cashRemaining)}</strong>
              </div>

              <div className="flow-connector" />

              <div className="flow-box">
                <span>Savings Rate</span>
                <strong>{formatPercent(savingsRate)}</strong>
              </div>
            </div>
          </section>

          {/* TRANSACTION SEARCH, FILTERS AND EXPORTS */}

          <section className="panel transaction-tools" hidden={activeTab !== "transactions"}>
            <div className="panel-header">
              <div>
                <h2>Find and export transactions</h2>
                <p>Search this month's records, narrow the list, or export the full selected-month ledger.</p>
              </div>
              <div className="report-actions">
                <button type="button" className="secondary-button" onClick={exportTransactionsCsv}>Export CSV</button>
                <button type="button" className="secondary-button" onClick={printMonthlyReport}>Print / Save PDF</button>
              </div>
            </div>
            <div className="transaction-filter-grid">
              <label>Search
                <input type="search" value={transactionSearch} onChange={(event) => setTransactionSearch(event.target.value)} placeholder="Category, source, description..." />
              </label>
              <label>Record type
                <select value={transactionTypeFilter} onChange={(event) => setTransactionTypeFilter(event.target.value)}>
                  <option value="all">Income and expenses</option>
                  <option value="expense">Expenses only</option>
                  <option value="income">Income only</option>
                </select>
              </label>
              <label>Expense category
                <select value={transactionCategoryFilter} onChange={(event) => setTransactionCategoryFilter(event.target.value)}>
                  <option value="all">All categories</option>
                  {expenseCategories.map((category) => <option key={category.id} value={String(category.id)}>{category.name}</option>)}
                </select>
              </label>
              <label>From date
                <input type="date" value={transactionDateFrom} onChange={(event) => setTransactionDateFrom(event.target.value)} />
              </label>
              <label>To date
                <input type="date" value={transactionDateTo} onChange={(event) => setTransactionDateTo(event.target.value)} />
              </label>
              <button type="button" className="secondary-button clear-filters-button" onClick={() => { setTransactionSearch(""); setTransactionCategoryFilter("all"); setTransactionTypeFilter("all"); setTransactionDateFrom(""); setTransactionDateTo(""); }}>Clear filters</button>
            </div>
            <p className="filter-result-count">Showing {filteredMonthExpenses.length} expense(s) and {filteredMonthIncome.length} income record(s) for {selectedMonthLabel}.</p>
          </section>

          {/* RECENT EXPENSES */}

          <section className="panel" hidden={activeTab !== "transactions"}>
            <div className="panel-header">
              <div>
                <h2>Recent Expenses</h2>

                <p>Transactions recorded in the selected month.</p>
              </div>
            </div>

            {filteredMonthExpenses.length === 0 ? (
              <p className="empty-state">No expenses match the current filters.</p>
            ) : (
              <div className="transaction-list">
                {filteredMonthExpenses
                  .slice()
                  .sort((a, b) =>
                    String(b.transaction_date).localeCompare(
                      String(a.transaction_date)
                    )
                  )
                  .map((expense) => (
                    <div className="transaction-row" key={expense.id}>
                      <div>
                        <strong>
                          {getCategoryName(expense.category_id)}
                        </strong>

                        <span>
                          {expense.description || "No description"}
                        </span>

                        <small>{expense.transaction_date}</small>
                      </div>

                      <div className="transaction-actions">
                        <strong>{formatMoney(expense.amount)}</strong>

                        <button
                          type="button"
                          className="small-button"
                          onClick={() => editExpense(expense)}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="small-button danger-button"
                          onClick={() => deleteExpense(expense.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </section>

          {/* RECENT INCOME */}

          <section className="panel" hidden={activeTab !== "transactions"}>
            <div className="panel-header">
              <div>
                <h2>Recent Income</h2>

                <p>Income recorded in the selected month.</p>
              </div>
            </div>

            {filteredMonthIncome.length === 0 ? (
              <p className="empty-state">No income matches the current filters.</p>
            ) : (
              <div className="transaction-list">
                {filteredMonthIncome
                  .slice()
                  .sort((a, b) =>
                    String(b.income_date).localeCompare(String(a.income_date))
                  )
                  .map((item) => (
                    <div className="transaction-row" key={item.id}>
                      <div>
                        <strong>{item.source}</strong>

                        <span>
                          {item.description || "No description"}
                        </span>

                        <small>{item.income_date}</small>
                      </div>

                      <div className="transaction-actions">
                        <strong>{formatMoney(item.amount)}</strong>

                        <button
                          type="button"
                          className="small-button"
                          onClick={() => editIncome(item)}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="small-button danger-button"
                          onClick={() => deleteIncome(item.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </section>

          {/* INCOME VS EXPENDITURE */}

          <section className="panel" hidden={activeTab !== "home"}>
            <div className="panel-header">
              <div>
                <h2>Income vs Expenditure</h2>
                <p>Monthly cash-flow position.</p>
              </div>
            </div>

            <div className="summary-grid">
              <div className="summary-card">
                <span>Income</span>
                <strong>{formatMoney(totalIncome)}</strong>
              </div>

              <div className="summary-card">
                <span>Expenditure</span>
                <strong>{formatMoney(totalExpenses)}</strong>
              </div>

              <div className="summary-card">
                <span>Net Cash Flow</span>
                <strong>{formatMoney(cashRemaining)}</strong>
              </div>
            </div>
          </section>
        </>
      )}

            <nav className="bottom-navigation" aria-label="Main navigation">
        <button
          type="button"
          className={`nav-item ${activeTab === "home" ? "active" : ""}`}
          onClick={() => setActiveTab("home")}
          aria-current={activeTab === "home" ? "page" : undefined}
        >
          <span className="nav-icon" aria-hidden="true">⌂</span>
          <span>Home</span>
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === "transactions" ? "active" : ""}`}
          onClick={() => setActiveTab("transactions")}
          aria-current={activeTab === "transactions" ? "page" : undefined}
        >
          <span className="nav-icon" aria-hidden="true">↔</span>
          <span>Transactions</span>
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === "budgets" ? "active" : ""}`}
          onClick={() => setActiveTab("budgets")}
          aria-current={activeTab === "budgets" ? "page" : undefined}
        >
          <span className="nav-icon" aria-hidden="true">◎</span>
          <span>Budgets</span>
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === "savings" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("savings");
            setExpandedForm(null);
          }}
          aria-current={activeTab === "savings" ? "page" : undefined}
        >
          <span className="nav-icon" aria-hidden="true">♧</span>
          <span>Savings</span>
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === "insights" ? "active" : ""}`}
          onClick={() => setActiveTab("insights")}
          aria-current={activeTab === "insights" ? "page" : undefined}
        >
          <span className="nav-icon" aria-hidden="true">▥</span>
          <span>Insights</span>
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === "more" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("more");
            setExpandedForm(null);
          }}
          aria-label="Open M-Pesa statement and SMS parser"
          aria-current={activeTab === "more" ? "page" : undefined}
        >
          <span className="nav-icon" aria-hidden="true">•••</span>
          <span>M-Pesa</span>
        </button>
                <button
          type="button"
          className={`nav-item ${activeTab === "profile" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("profile");
            setExpandedForm(null);
          }}
          aria-current={activeTab === "profile" ? "page" : undefined}
        >
          <span className="nav-icon" aria-hidden="true">♙</span>
          <span>Profile</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
