import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentUser, getUserOrganizations, Organization } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import Papa from 'papaparse';
import {
  Clock,
  Home,
  ChevronRight,
  DollarSign,
  Calendar,
  TrendingUp,
  Lock,
  Download,
  Trash2,
  FileText,
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, subMonths } from 'date-fns';

interface ReportTemplate {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  filters: string[];
}

const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: 'billable_hours',
    name: 'Billable Hours Report',
    icon: <DollarSign className="h-8 w-8 text-success" />,
    description: 'For invoicing clients and tracking revenue',
    filters: ['dateRange', 'project', 'user'],
  },
  {
    id: 'timesheet',
    name: 'Timesheet Report',
    icon: <Calendar className="h-8 w-8 text-primary" />,
    description: 'For payroll and compliance audits',
    filters: ['dateRange', 'user', 'approvalStatus'],
  },
  {
    id: 'velocity',
    name: 'Velocity Report',
    icon: <TrendingUp className="h-8 w-8 text-warning" />,
    description: 'For sprint retrospectives and team performance',
    filters: ['dateRange', 'team'],
  },
  {
    id: 'audit',
    name: 'Audit Report',
    icon: <Lock className="h-8 w-8 text-danger" />,
    description: 'For compliance audits (SOX, GDPR)',
    filters: ['dateRange', 'user', 'table'],
  },
];

const Reports = () => {
  const [user, setUser] = useState<any>(null);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ReportTemplate | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  
  // Filter states
  const [dateRange, setDateRange] = useState('this_month');
  const [filterUser, setFilterUser] = useState('all');
  const [filterProject, setFilterProject] = useState('all');
  const [filterTeam, setFilterTeam] = useState('all');
  const [filterApprovalStatus, setFilterApprovalStatus] = useState('all');
  const [filterTable, setFilterTable] = useState('all');
  const [exportFormat, setExportFormat] = useState('csv');
  
  // Data states
  const [users, setUsers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [generatedReports, setGeneratedReports] = useState<any[]>([]);
  
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (currentOrg) {
      fetchFilterOptions();
      fetchGeneratedReports();
    }
  }, [currentOrg]);

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
    setIsLoading(false);
  };

  const getDateRange = (range: string) => {
    const now = new Date();
    let start: Date, end: Date;

    switch (range) {
      case 'this_week':
        start = startOfWeek(now, { weekStartsOn: 1 });
        end = endOfWeek(now, { weekStartsOn: 1 });
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
      default:
        start = startOfMonth(now);
        end = endOfMonth(now);
    }

    return { start: start.toISOString(), end: end.toISOString() };
  };

  const fetchFilterOptions = async () => {
    if (!currentOrg) return;

    // Fetch users
    const { data: usersData } = await supabase.rpc('get_org_members_with_emails', {
      p_org_id: currentOrg.id
    });
    setUsers(usersData || []);

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

  const fetchGeneratedReports = async () => {
    // TODO: Fetch from generated_reports table when it exists
    setGeneratedReports([]);
  };

  const openGenerateModal = (template: ReportTemplate) => {
    setSelectedReport(template);
    setShowGenerateModal(true);
    // Reset filters
    setDateRange('this_month');
    setFilterUser('all');
    setFilterProject('all');
    setFilterTeam('all');
    setFilterApprovalStatus('all');
    setFilterTable('all');
    setExportFormat('csv');
  };

  const generateBillableHoursReport = async () => {
    if (!currentOrg) return;

    const { start, end } = getDateRange(dateRange);

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
      .eq('is_billable', true)
      .gte('start_time', start)
      .lte('start_time', end)
      .is('deleted_at', null)
      .order('start_time');

    if (filterUser !== 'all') {
      query = query.eq('user_id', filterUser);
    }

    if (filterProject !== 'all') {
      query = query.eq('project_id', filterProject);
    }

    const { data: timeEntries, error } = await query;

    if (error) {
      throw error;
    }

    if (!timeEntries || timeEntries.length === 0) {
      toast({
        title: 'No data found',
        description: 'No billable hours found for the selected filters.',
        variant: 'destructive',
      });
      return;
    }

    if (timeEntries.length > 10000) {
      toast({
        title: 'Report too large',
        description: 'Report exceeds 10,000 rows. Please apply additional filters to reduce size.',
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
      ? await supabase.from('tasks').select('id, code, title').in('id', taskIds)
      : { data: [] };

    // Map data
    const userMap = new Map((usersData || []).map(u => [u.user_id, u.email] as [string, string]));
    const projectMap = new Map((projectsData || []).map(p => [p.id, p.name] as [string, string]));
    const taskMap = new Map((tasksData || []).map(t => [t.id, { code: t.code, title: t.title }] as [string, { code: string; title: string }]));

    // Format data for CSV
    const csvData = timeEntries.map(entry => ({
      Date: format(new Date(entry.start_time), 'yyyy-MM-dd'),
      User: userMap.get(entry.user_id) || 'Unknown',
      Project: entry.project_id ? projectMap.get(entry.project_id) || 'Unknown' : 'Personal',
      'Task Code': entry.task_id ? taskMap.get(entry.task_id)?.code || '' : '',
      'Task Title': entry.task_id ? taskMap.get(entry.task_id)?.title || '' : '',
      'Duration (hours)': (entry.duration_seconds / 3600).toFixed(2),
      Description: entry.description || '',
      Billable: entry.is_billable ? 'TRUE' : 'FALSE',
    }));

    return csvData;
  };

  const generateTimesheetReport = async () => {
    if (!currentOrg) return;

    const { start, end } = getDateRange(dateRange);

    let query = supabase
      .from('timesheets')
      .select(`
        week_start_date,
        week_end_date,
        total_hours,
        billable_hours,
        status,
        reviewed_by,
        reviewed_at,
        user_id
      `)
      .eq('organization_id', currentOrg.id)
      .gte('week_start_date', start)
      .lte('week_end_date', end)
      .is('deleted_at', null)
      .order('week_start_date', { ascending: false });

    if (filterUser !== 'all') {
      query = query.eq('user_id', filterUser);
    }

    if (filterApprovalStatus !== 'all') {
      query = query.eq('status', filterApprovalStatus);
    }

    const { data: timesheets, error } = await query;

    if (error) {
      throw error;
    }

    if (!timesheets || timesheets.length === 0) {
      toast({
        title: 'No data found',
        description: 'No timesheets found for the selected filters.',
        variant: 'destructive',
      });
      return;
    }

    if (timesheets.length > 10000) {
      toast({
        title: 'Report too large',
        description: 'Report exceeds 10,000 rows. Please apply additional filters.',
        variant: 'destructive',
      });
      return;
    }

    // Fetch user data
    const { data: usersData } = await supabase.rpc('get_org_members_with_emails', {
      p_org_id: currentOrg.id
    });
    const userMap = new Map(usersData?.map(u => [u.user_id, u.email]) || []);

    // Format data for CSV
    const csvData = timesheets.map(ts => ({
      'Week Start': format(new Date(ts.week_start_date), 'yyyy-MM-dd'),
      'Week End': format(new Date(ts.week_end_date), 'yyyy-MM-dd'),
      User: userMap.get(ts.user_id) || 'Unknown',
      'Total Hours': ts.total_hours?.toFixed(1) || '0.0',
      'Billable Hours': ts.billable_hours?.toFixed(1) || '0.0',
      Status: ts.status.toUpperCase(),
      'Reviewed By': ts.reviewed_by ? userMap.get(ts.reviewed_by) || 'Unknown' : '',
      'Reviewed At': ts.reviewed_at ? format(new Date(ts.reviewed_at), 'yyyy-MM-dd HH:mm') : '',
    }));

    return csvData;
  };

  const generateVelocityReport = async () => {
    if (!currentOrg) return;

    const { start, end } = getDateRange(dateRange);

    // Query tasks completed in the date range
    let query = supabase
      .from('tasks')
      .select(`
        id,
        status,
        completed_at,
        project_id
      `)
      .eq('organization_id', currentOrg.id)
      .eq('status', 'done')
      .gte('completed_at', start)
      .lte('completed_at', end)
      .is('deleted_at', null);

    const { data: tasks, error } = await query;

    if (error) {
      throw error;
    }

    if (!tasks || tasks.length === 0) {
      toast({
        title: 'No data found',
        description: 'No completed tasks found for the selected filters.',
        variant: 'destructive',
      });
      return;
    }

    // Group by project
    const projectStats = tasks.reduce((acc: any, task) => {
      const projectId = task.project_id || 'Personal';
      if (!acc[projectId]) {
        acc[projectId] = {
          tasksCompleted: 0,
          storyPoints: 0,
        };
      }
      acc[projectId].tasksCompleted++;
      return acc;
    }, {});

    // Fetch project names
    const projectIds = Object.keys(projectStats).filter(id => id !== 'Personal');
    const { data: projectsData } = projectIds.length > 0
      ? await supabase.from('projects').select('id, name').in('id', projectIds)
      : { data: [] };
    const projectMap = new Map((projectsData || []).map(p => [p.id, p.name] as [string, string]));

    // Format data for CSV
    const csvData = Object.entries(projectStats).map(([projectId, stats]: [string, any]) => ({
      Sprint: format(new Date(start), 'MMM yyyy'),
      Project: projectId === 'Personal' ? 'Personal Tasks' : projectMap.get(projectId) || 'Unknown',
      'Tasks Completed': stats.tasksCompleted,
      'Story Points': stats.storyPoints || 'N/A',
      Velocity: stats.storyPoints || 'N/A',
    }));

    return csvData;
  };

  const generateAuditReport = async () => {
    if (!currentOrg) return;

    const { start, end } = getDateRange(dateRange);

    let query = supabase
      .from('audit_logs')
      .select(`
        created_at,
        user_id,
        action,
        table_name,
        record_id,
        old_values,
        new_values
      `)
      .eq('organization_id', currentOrg.id)
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false });

    if (filterUser !== 'all') {
      query = query.eq('user_id', filterUser);
    }

    if (filterTable !== 'all') {
      query = query.eq('table_name', filterTable);
    }

    const { data: auditLogs, error } = await query;

    if (error) {
      throw error;
    }

    if (!auditLogs || auditLogs.length === 0) {
      toast({
        title: 'No data found',
        description: 'No audit logs found for the selected filters.',
        variant: 'destructive',
      });
      return;
    }

    if (auditLogs.length > 10000) {
      toast({
        title: 'Report too large',
        description: 'Report exceeds 10,000 rows. Please apply additional filters.',
        variant: 'destructive',
      });
      return;
    }

    // Fetch user data
    const { data: usersData } = await supabase.rpc('get_org_members_with_emails', {
      p_org_id: currentOrg.id
    });
    const userMap = new Map((usersData || []).map(u => [u.user_id, u.email] as [string, string]));

    // Format data for CSV
    const csvData = auditLogs.map(log => {
      let changes = '';
      if (log.action === 'UPDATE' && log.old_values && log.new_values) {
        const oldVals = JSON.stringify(log.old_values);
        const newVals = JSON.stringify(log.new_values);
        changes = `${oldVals} → ${newVals}`;
      } else if (log.action === 'INSERT' && log.new_values) {
        changes = JSON.stringify(log.new_values);
      } else if (log.action === 'DELETE' && log.old_values) {
        changes = JSON.stringify(log.old_values);
      }

      return {
        Timestamp: format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss'),
        User: log.user_id ? userMap.get(log.user_id) || 'System' : 'System',
        Action: log.action,
        Table: log.table_name,
        'Record ID': log.record_id,
        Changes: changes,
      };
    });

    return csvData;
  };

  const handleGenerateReport = async () => {
    if (!selectedReport || !currentOrg) return;

    setIsGenerating(true);

    try {
      let csvData: any[] = [];

      switch (selectedReport.id) {
        case 'billable_hours':
          csvData = await generateBillableHoursReport() || [];
          break;
        case 'timesheet':
          csvData = await generateTimesheetReport() || [];
          break;
        case 'velocity':
          csvData = await generateVelocityReport() || [];
          break;
        case 'audit':
          csvData = await generateAuditReport() || [];
          break;
      }

      if (csvData.length === 0) {
        setIsGenerating(false);
        return;
      }

      // Generate CSV
      const csv = Papa.unparse(csvData);
      
      // Download file
      const { start, end } = getDateRange(dateRange);
      const filename = `${selectedReport.id}_${format(new Date(start), 'yyyy-MM-dd')}_${format(new Date(end), 'yyyy-MM-dd')}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();

      toast({
        title: 'Report generated',
        description: `${selectedReport.name} downloaded successfully.`,
      });

      setShowGenerateModal(false);
    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: 'Error generating report',
        description: 'An error occurred while generating the report. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Clock className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      {/* Header with Breadcrumb */}
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Home className="h-4 w-4" />
            <ChevronRight className="h-4 w-4" />
            <span className="text-foreground font-medium">Reports</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Generate and export reports for billing, compliance, and retrospectives
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Report Templates */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {REPORT_TEMPLATES.map((template) => (
            <Card key={template.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-muted rounded-lg">
                    {template.icon}
                  </div>
                  <div className="flex-1">
                    <CardTitle className="mb-2">{template.name}</CardTitle>
                    <CardDescription>{template.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Button 
                  className="w-full" 
                  onClick={() => openGenerateModal(template)}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Generate Report
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Generated Reports List (empty for now) */}
        {generatedReports.length > 0 && (
          <div>
            <h2 className="text-xl font-bold mb-4">Generated Reports</h2>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Report Name</TableHead>
                    <TableHead>Generated By</TableHead>
                    <TableHead>Generated At</TableHead>
                    <TableHead>Filters</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {generatedReports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell>{report.name}</TableCell>
                      <TableCell>{report.generated_by}</TableCell>
                      <TableCell>{report.generated_at}</TableCell>
                      <TableCell>{report.filters}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline">
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        )}
      </main>

      {/* Generate Report Modal */}
      <Dialog open={showGenerateModal} onOpenChange={setShowGenerateModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedReport?.name}</DialogTitle>
            <DialogDescription>
              Configure filters and export format for your report
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Date Range Filter */}
            {selectedReport?.filters.includes('dateRange') && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Date Range</label>
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select date range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="this_week">This Week</SelectItem>
                    <SelectItem value="this_month">This Month</SelectItem>
                    <SelectItem value="last_month">Last Month</SelectItem>
                    <SelectItem value="this_quarter">This Quarter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* User Filter */}
            {selectedReport?.filters.includes('user') && (
              <div className="space-y-2">
                <label className="text-sm font-medium">User</label>
                <Select value={filterUser} onValueChange={setFilterUser}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.user_id} value={user.user_id}>
                        {user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Project Filter */}
            {selectedReport?.filters.includes('project') && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Project</label>
                <Select value={filterProject} onValueChange={setFilterProject}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Team Filter */}
            {selectedReport?.filters.includes('team') && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Team</label>
                <Select value={filterTeam} onValueChange={setFilterTeam}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Teams</SelectItem>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Approval Status Filter */}
            {selectedReport?.filters.includes('approvalStatus') && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Approval Status</label>
                <Select value={filterApprovalStatus} onValueChange={setFilterApprovalStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="submitted">Pending</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Table Filter */}
            {selectedReport?.filters.includes('table') && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Table</label>
                <Select value={filterTable} onValueChange={setFilterTable}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select table" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tables</SelectItem>
                    <SelectItem value="tasks">Tasks</SelectItem>
                    <SelectItem value="time_entries">Time Entries</SelectItem>
                    <SelectItem value="projects">Projects</SelectItem>
                    <SelectItem value="teams">Teams</SelectItem>
                    <SelectItem value="timesheets">Timesheets</SelectItem>
                    <SelectItem value="subscriptions">Subscriptions</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Export Format */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Export Format</label>
              <Select value={exportFormat} onValueChange={setExportFormat}>
                <SelectTrigger>
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="pdf" disabled>PDF (Coming Soon)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerateReport} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Generate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Reports;
