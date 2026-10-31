Attribute VB_Name = "Seguimiento"
Option Explicit

Public Sub Entrar()
    Dim asesor As String, clave As String, hoja As Worksheet
    asesor = InputBox("Asesor: David, Alison, Patricia, Laura, Jose o Viviana", "Acceso")
    If asesor = "" Then Exit Sub
    clave = InputBox("Clave", "Acceso")
    If Not ClaveOk(asesor, clave) Then
        MsgBox "Clave incorrecta"
        Exit Sub
    End If
    Application.ScreenUpdating = False
    For Each hoja In ThisWorkbook.Worksheets
        If hoja.Name <> "Instrucciones" Then hoja.Visible = xlSheetVeryHidden
    Next hoja
    If asesor = "Viviana" Then
        For Each hoja In ThisWorkbook.Worksheets
            If hoja.Name <> "Instrucciones" Then hoja.Visible = xlSheetVisible
        Next hoja
        ThisWorkbook.Worksheets("Viviana").Activate
    Else
        ThisWorkbook.Worksheets(asesor).Visible = xlSheetVisible
        ThisWorkbook.Worksheets(asesor).Activate
    End If
    Application.ScreenUpdating = True
End Sub

Public Sub NuevoSeguimiento()
    Dim hoja As Worksheet, fila As Long
    Dim placa As String, cc As String, nombre As String, tel As String, empresa As String
    If ActiveSheet.Name = "Instrucciones" Or ActiveSheet.Name = "Viviana" Then
        MsgBox "Entra primero a tu hoja."
        Exit Sub
    End If
    Set hoja = ActiveSheet
    placa = UCase(InputBox("Placa"))
    If placa = "" Then Exit Sub
    cc = InputBox("CC propietario")
    nombre = UCase(InputBox("Nombre del propietario"))
    tel = InputBox("Número de contacto")
    empresa = InputBox("Empresa actual")
    fila = hoja.Cells(hoja.Rows.Count, 1).End(xlUp).Row + 1
    If fila < 5 Then fila = 5
    hoja.Cells(fila, 1).Value = placa
    hoja.Cells(fila, 2).Value = cc
    hoja.Cells(fila, 3).Value = nombre
    hoja.Cells(fila, 4).Value = tel
    hoja.Cells(fila, 5).Value = empresa
    hoja.Cells(fila, 6).Value = Date
    hoja.Cells(fila, 7).Value = "Sí"
    hoja.Cells(fila, 1).Select
End Sub

Private Function ClaveOk(asesor As String, clave As String) As Boolean
    Select Case asesor
        Case "David": ClaveOk = (clave = "David2026")
        Case "Alison": ClaveOk = (clave = "Alison2026")
        Case "Patricia": ClaveOk = (clave = "Patricia2026")
        Case "Laura": ClaveOk = (clave = "Laura2026")
        Case "Jose": ClaveOk = (clave = "Jose2026")
        Case "Viviana": ClaveOk = (clave = "Viviana2026")
    End Select
End Function
