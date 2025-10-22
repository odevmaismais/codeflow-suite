import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentUser, getUserOrganizations, Organization } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import {
  Clock,
  TrendingUp,
  TrendingDown,
  CheckSquare,
  Zap,
  Home,
  ChevronRight,
  Download,
} from 'lucide-react';
import Papa from 'papaparse';
import { LineChart, Line, PieChart, Pie, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subWeeks, subMonths } from 'date-fns';
import { PageLayout } from '@/components/PageLayout';

const COLORS = {
  primary: '#3B82F6',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  gray: '#9CA3AF',
};

const STATUS_COLORS = {
  todo: COLORS.gray,
  in_progress: COLORS.primary,
  in_review: COLORS.warning,
  blocked: COLORS.danger,
  done: COLORS.success,
};

const Analytics = () => {
  const [user, setUser] = useState<any>(null);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState('this_week');
  const [filterUser, setFilterUser] = useState('all');
  const [filterProject, setFilterProject] = useState('all');
  const [filterTeam, setFilterTeam] = useState('all');
  const [filterTaskType, setFilterTaskType] = useState('all');
  const [billableOnly, setBillableOnly] = useState(false);
  
  const [kpis, setKpis] = useState({
    totalHours: 0,
    totalHoursTrend: 0,
    billableHours: 0,
    billablePercentage: 0,
    tasksCompleted: 0,
    tasksCompletedTrend: 0,
    velocity: 0,
  });
  
  const [hoursOverTime, setHoursOverTime] = useState<any[]>([]);
  const [tasksByStatus, setTasksByStatus] = useState<any[]>([]);
  const [hoursByProject, setHoursByProject] = useState<any[]>([]);
  const [activityHeatmap, setActivityHeatmap] = useState<any[]>([]);
  
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [userRole, setUserRole] = useState<string>('member');
  
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (currentOrg) {
      fetchFilterOptions();
      fetchAnalyticsData();
    }
  }, [currentOrg, dateRange, filterUser, filterProject, filterTeam, filterTaskType, billableOnly]);

  const checkAuth = async () => {
    const authUser = await getCurrentUser();
    if (!authUser) {
      navigate('/auth');
      return;
    }

    setUser(authUser);

    const orgs = await getUserOrganizations();
    if (orgs.length === 0) {
      navigate('/onboarding');
      return;
    }

    const savedOrgId = localStorage.getItem('activeOrgId');
    const activeOrg = savedOrgId 
      ? orgs.find(o => o.id === savedOrgId) || orgs[0]
      : orgs[0];
    
    setCurrentOrg(activeOrg);
    setUserRole(activeOrg.role);
    setIsLoading(false);
  };

  const getDateRange = () => {
    const now = new Date();
    let start: Date, end: Date;

    switch (dateRange) {
      case 'this_week':
        start = startOfWeek(now, { weekStartsOn: 1 });
        end = endOfWeek(now, { weekStartsOn: 1 });
        break;
      case 'last_week':
        const lastWeek = subWeeks(now, 1);
        start = startOfWeek(lastWeek, { weekStartsOn: 1 });
        end = endOfWeek(lastWeek, { weekStartsOn: 1 });
        break;
      case 'this_month':
        start = startOfMonth(now);
        end = endOfMonth(now);
        break;
      case 'last_month':
        const lastMonth = subMonths(now, 1);
        start = startOfMonth(lastMonth);
        end = endOfMonth(lastMonth);
        break;
      case 'this_quarter':
        start = startOfQuarter(now);
        end = endOfQuarter(now);
        break;
      case 'this_year':
        start = startOfYear(now);
        end = endOfYear(now);
        break;
      default:
        start = startOfWeek(now, { weekStartsOn: 1 });
        end = endOfWeek(now, { weekStartsOn: 1 });
    }

    return { start: start.toISOString(), end: end.toISOString() };
  };

  const fetchFilterOptions = async () => {
    if (!currentOrg) return;

    // Fetch team members (only for Tech Leads and Admins)
    if (userRole === 'admin' || userRole === 'manager') {
      const { data: members } = await supabase
        .from('user_organizations')
        .select('user_id')
        .eq('organization_id', currentOrg.id);

      if (members) {
        // Get user emails via security definer function
        const { data: membersWithEmails } = await supabase.rpc('get_org_members_with_emails', {
          p_org_id: currentOrg.id
        });
        setTeamMembers(membersWithEmails || []);
      }
    }

    // Fetch projects
    const { data: projectsData } = await supabase
      .from('projects')
      .select('id, name')
      .eq('organization_id', currentOrg.id)
      .is('deleted_at', null)
      .order('name');
    setProjects(projectsData || []);

    // Fetch teams
    const { data: teamsData } = await supabase
      .from('teams')
      .select('id, name')
      .eq('organization_id', currentOrg.id)
      .is('deleted_at', null)
      .order('name');
    setTeams(teamsData || []);
  };

  const fetchAnalyticsData = async () => {
    if (!currentOrg) return;

    const { start, end } = getDateRange();
    
    // Build base query filters
    let timeEntriesQuery = supabase
      .from('time_entries')
      .select('*')
      .eq('organization_id', currentOrg.id)
      .gte('start_time', start)
      .lte('start_time', end)
      .is('deleted_at', null);

    if (filterUser !== 'all') {
      timeEntriesQuery = timeEntriesQuery.eq('user_id', filterUser === 'me' ? user.id : filterUser);
    }

    if (filterProject !== 'all') {
      timeEntriesQuery = timeEntriesQuery.eq('project_id', filterProject);
    }

    if (billableOnly) {
      timeEntriesQuery = timeEntriesQuery.eq('is_billable', true);
    }

    const { data: timeEntries } = await timeEntriesQuery;

    // Calculate KPIs
    if (timeEntries) {
      const totalSeconds = timeEntries.reduce((sum, entry) => sum + (entry.duration_seconds || 0), 0);
      const totalHours = totalSeconds / 3600;

      const billableSeconds = timeEntries
        .filter(e => e.is_billable)
        .reduce((sum, entry) => sum + (entry.duration_seconds || 0), 0);
      const billableHours = billableSeconds / 3600;

      setKpis({
        totalHours: parseFloat(totalHours.toFixed(1)),
        totalHoursTrend: 12, // TODO: Calculate actual trend
        billableHours: parseFloat(billableHours.toFixed(1)),
        billablePercentage: totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0,
        tasksCompleted: 0, // Will fetch separately
        tasksCompletedTrend: 5,
        velocity: 0,
      });

      // Process hours over time
      const dailyHours = timeEntries.reduce((acc: any, entry) => {
        const date = format(new Date(entry.start_time), 'MMM dd');
        if (!acc[date]) {
          acc[date] = { date, totalHours: 0, billableHours: 0 };
        }
        acc[date].totalHours += (entry.duration_seconds || 0) / 3600;
        if (entry.is_billable) {
          acc[date].billableHours += (entry.duration_seconds || 0) / 3600;
        }
        return acc;
      }, {});

      setHoursOverTime(Object.values(dailyHours).map((day: any) => ({
        ...day,
        totalHours: parseFloat(day.totalHours.toFixed(1)),
        billableHours: parseFloat(day.billableHours.toFixed(1)),
      })));

      // Process hours by project
      const projectHours = timeEntries.reduce((acc: any, entry) => {
        const projectId = entry.project_id || 'Personal';
        if (!acc[projectId]) {
          acc[projectId] = { project: projectId, billable: 0, nonBillable: 0 };
        }
        if (entry.is_billable) {
          acc[projectId].billable += (entry.duration_seconds || 0) / 3600;
        } else {
          acc[projectId].nonBillable += (entry.duration_seconds || 0) / 3600;
        }
        return acc;
      }, {});

      // Get project names
      const projectIds = Object.keys(projectHours).filter(id => id !== 'Personal');
      if (projectIds.length > 0) {
        const { data: projectNames } = await supabase
          .from('projects')
          .select('id, name')
          .in('id', projectIds);

        const projectHoursArray = Object.entries(projectHours).map(([id, hours]: [string, any]) => {
          const projectName = id === 'Personal' 
            ? 'Personal Tasks' 
            : projectNames?.find(p => p.id === id)?.name || 'Unknown';
          
          return {
            project: projectName,
            billable: parseFloat(hours.billable.toFixed(1)),
            nonBillable: parseFloat(hours.nonBillable.toFixed(1)),
            total: parseFloat((hours.billable + hours.nonBillable).toFixed(1)),
          };
        });

        setHoursByProject(
          projectHoursArray
            .sort((a, b) => b.total - a.total)
            .slice(0, 5)
        );
      }
    }

    // Fetch tasks by status
    let tasksQuery = supabase
      .from('tasks')
      .select('status')
      .eq('organization_id', currentOrg.id)
      .gte('created_at', start)
      .lte('created_at', end)
      .is('deleted_at', null);

    if (filterProject !== 'all') {
      tasksQuery = tasksQuery.eq('project_id', filterProject);
    }

    if (filterTaskType !== 'all') {
      tasksQuery = tasksQuery.eq('task_type', filterTaskType);
    }

    const { data: tasks } = await tasksQuery;

    if (tasks) {
      const statusCounts = tasks.reduce((acc: any, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1;
        return acc;
      }, {});

      const total = tasks.length;
      setTasksByStatus(
        Object.entries(statusCounts).map(([status, count]: [string, any]) => ({
          name: status.replace('_', ' ').toUpperCase(),
          value: count,
          percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        }))
      );

      // Update tasks completed KPI
      const completedTasks = tasks.filter(t => t.status === 'done').length;
      setKpis(prev => ({ ...prev, tasksCompleted: completedTasks }));
    }
  };

  const formatHours = (hours: number) => {
    return `${hours.toFixed(1)}h`;
  };

  const handleExportCSV = async () => {
    if (!currentOrg) return;

    const { start, end } = getDateRange();

    let query = supabase
      .from('time_entries')
      .select(`
        start_time,
        duration_seconds,
        description,
        is_billable,
        user_id,
        project_id,
        task_id
      `)
      .eq('organization_id', currentOrg.id)
      .gte('start_time', start)
      .lte('start_time', end)
      .is('deleted_at', null)
      .order('start_time');

    if (filterUser !== 'all' && filterUser !== 'me') {
      query = query.eq('user_id', filterUser);
    } else if (filterUser === 'me') {
      query = query.eq('user_id', user.id);
    }

    if (filterProject !== 'all') {
      query = query.eq('project_id', filterProject);
    }

    if (billableOnly) {
      query = query.eq('is_billable', true);
    }

    const { data: timeEntries } = await query;

    if (!timeEntries || timeEntries.length === 0) {
      toast({
        title: 'No data to export',
        description: 'No time entries found for the selected filters.',
        variant: 'destructive',
      });
      return;
    }

    // Fetch related data
    const userIds = [...new Set(timeEntries.map(e => e.user_id))];
    const projectIds = [...new Set(timeEntries.map(e => e.project_id).filter(Boolean))];
    const taskIds = [...new Set(timeEntries.map(e => e.task_id).filter(Boolean))];

    const { data: usersData } = await supabase.rpc('get_org_members_with_emails', {
      p_org_id: currentOrg.id
    });

    const { data: projectsData } = projectIds.length > 0
      ? await supabase.from('projects').select('id, name').in('id', projectIds)
      : { data: [] };

    const { data: tasksData } = taskIds.length > 0
      ? await supabase.from('tasks').select('id, code').in('id', taskIds)
      : { data: [] };

    // Map data
    const userMap = new Map((usersData || []).map(u => [u.user_id, u.email] as [string, string]));
    const projectMap = new Map((projectsData || []).map(p => [p.id, p.name] as [string, string]));
    const taskMap = new Map((tasksData || []).map(t => [t.id, t.code] as [string, string]));

    // Format data for CSV
    const csvData = timeEntries.map(entry => ({
      Date: format(new Date(entry.start_time), 'yyyy-MM-dd'),
      User: userMap.get(entry.user_id) || 'Unknown',
      Project: entry.project_id ? projectMap.get(entry.project_id) || 'Unknown' : 'Personal',
      'Task Code': entry.task_id ? taskMap.get(entry.task_id) || '' : '',
      'Duration (hours)': (entry.duration_seconds / 3600).toFixed(2),
      Billable: entry.is_billable ? 'TRUE' : 'FALSE',
    }));

    // Generate CSV
    const csv = Papa.unparse(csvData);
    
    // Download file
    const filename = `analytics_export_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();

    toast({
      title: 'Export complete',
      description: 'Analytics data exported successfully.',
    });
  };

  if (isLoading) {
    return (
      <PageLayout 
        title="Analytics" 
        breadcrumbs={[
          { label: "Home", href: "/dashboard" },
          { label: "Analytics" }
        ]}
      >
        <div className="flex items-center justify-center py-12">
          <Clock className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout 
      title="Analytics & Insights"
      breadcrumbs={[
        { label: "Home", href: "/dashboard" },
        { label: "Analytics" }
      ]}
    >
      <p className="text-muted-foreground mb-6">Track productivity, velocity, and billable hours</p>

      {/* Filters Bar */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-4 items-center">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_week">This Week</SelectItem>
                <SelectItem value="last_week">Last Week</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
                <SelectItem value="this_quarter">This Quarter</SelectItem>
                <SelectItem value="this_year">This Year</SelectItem>
              </SelectContent>
            </Select>

            {(userRole === 'admin' || userRole === 'manager') && (
              <Select value={filterUser} onValueChange={setFilterUser}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="User" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  <SelectItem value="me">Me</SelectItem>
                  {teamMembers.map(member => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      {member.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.map(project => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterTeam} onValueChange={setFilterTeam}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                {teams.map(team => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterTaskType} onValueChange={setFilterTaskType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Task Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="feature">Feature</SelectItem>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="test">Test</SelectItem>
                <SelectItem value="documentation">Documentation</SelectItem>
                <SelectItem value="refactor">Refactor</SelectItem>
                <SelectItem value="spike">Spike</SelectItem>
              </SelectContent>
            </Select>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="billable" 
                  checked={billableOnly} 
                  onCheckedChange={(checked) => setBillableOnly(checked as boolean)}
                />
                <label htmlFor="billable" className="text-sm cursor-pointer">
                  Billable Only
                </label>
              </div>
            </div>

            <Button onClick={handleExportCSV} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Hours
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">
                {formatHours(kpis.totalHours)}
              </div>
              <div className="flex items-center gap-1 mt-2 text-sm">
                <TrendingUp className="h-4 w-4 text-success" />
                <span className="text-success">+{kpis.totalHoursTrend}%</span>
                <span className="text-muted-foreground">vs last period</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Billable Hours
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-success">
                {formatHours(kpis.billableHours)}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                {kpis.billablePercentage}% billable
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tasks Completed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">
                {kpis.tasksCompleted}
              </div>
              <div className="flex items-center gap-1 mt-2 text-sm">
                <TrendingUp className="h-4 w-4 text-success" />
                <span className="text-success">+{kpis.tasksCompletedTrend}</span>
                <span className="text-muted-foreground">vs last period</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Velocity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">
                {kpis.velocity || 'N/A'}
              </div>
              <div className="mt-2 text-sm text-success">
                On track
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Hours Over Time</CardTitle>
              <CardDescription>Daily breakdown of logged hours</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={hoursOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
                  <YAxis stroke="#6b7280" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="totalHours" 
                    stroke={COLORS.primary} 
                    strokeWidth={2}
                    name="Total Hours"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="billableHours" 
                    stroke={COLORS.success} 
                    strokeWidth={2}
                    name="Billable Hours"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tasks by Status</CardTitle>
              <CardDescription>Current task distribution</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={tasksByStatus}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.name}: ${entry.percentage}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {tasksByStatus.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={STATUS_COLORS[entry.name.toLowerCase().replace(' ', '_') as keyof typeof STATUS_COLORS] || COLORS.gray} 
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Hours by Project</CardTitle>
              <CardDescription>Top 5 projects by time spent</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={hoursByProject}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="project" stroke="#6b7280" fontSize={12} />
                  <YAxis stroke="#6b7280" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="billable" stackId="a" fill={COLORS.success} name="Billable" />
                  <Bar dataKey="nonBillable" stackId="a" fill={COLORS.gray} name="Non-Billable" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity Heatmap</CardTitle>
              <CardDescription>Last 5 weeks of activity</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              <div className="text-muted-foreground text-sm">
                Activity heatmap visualization coming soon
              </div>
            </CardContent>
          </Card>
        </div>
    </PageLayout>
  );
};

export default Analytics;
